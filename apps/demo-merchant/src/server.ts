import express, { type ErrorRequestHandler } from "express";
import { rpc } from "@stellar/stellar-sdk";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { PaymentPayload } from "@x402/core/types";
import { PaymentPayloadV2Schema } from "@x402/core/schemas";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { digest, verdict, type Observation, type PurchaseReport } from "../../../packages/evidence/src/index.js";
import { observe } from "../../../packages/stellar-observer/src/index.js";
import { config, NETWORK, RPC_URL, PASSPHRASE } from "./config.js";
import { Queue, Store } from "./store.js";
import { toCsv, validateRows } from "./conversion.js";

const c = config();
const observer = new rpc.Server(RPC_URL);
if ((await observer.getNetwork()).passphrase !== PASSPHRASE) throw new Error("Unexpected RPC network.");
const resource = new x402ResourceServer(new HTTPFacilitatorClient({ url: c.facilitatorUrl }))
  .register(NETWORK, new ExactStellarScheme());
await resource.initialize();
const requirements = (await resource.buildPaymentRequirements({
  scheme: "exact", network: NETWORK, payTo: c.recipient,
  price: { asset: c.token, amount: c.amount }, maxTimeoutSeconds: 120,
}))[0]!;
const store = new Store(c.databasePath);
const queue = new Queue();
const app = express();
app.use(express.json({ limit: "64kb" }));
app.use((_,res,next) => { res.setHeader("Cache-Control","no-store"); next(); });
app.get("/health",(_,res) => res.json({ status: "ok", network: NETWORK, tokenContract: c.token, amountAtomic: c.amount, assetSymbol: "XLM", assetDecimals: 7 }));
async function receipt(authDigest: string): Promise<{ transaction?: string; success?: boolean }> {
  try {
    const response = await fetch(c.facilitatorUrl + "/receipts/" + authDigest, { signal: AbortSignal.timeout(15000) });
    return response.ok ? await response.json() as { transaction?: string; success?: boolean } : {};
  } catch { return {}; }
}
app.post("/purchases/:id", async (req,res,next) => {
  try {
    const id = req.params.id;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) { res.status(400).json({ error: "Invalid purchaseId." }); return; }
    const mode = req.query.mode ?? "durable";
    if (mode !== "durable" && mode !== "naive") { res.status(400).json({ error: "mode must be durable or naive." }); return; }
    const rows = validateRows(req.body?.rows);
    const bodyHash = digest(rows);
    const header = req.get("PAYMENT-SIGNATURE");
    if (!header) {
      const challenge = await resource.createPaymentRequiredResponse([requirements], {
        url: c.merchantUrl + "/purchases/" + id + "?mode=" + mode,
        description: "Deterministic JSON to CSV; Stellar Testnet XLM only", mimeType: "application/json",
      });
      res.setHeader("PAYMENT-REQUIRED",Buffer.from(JSON.stringify(challenge)).toString("base64"));
      res.status(402).json(challenge);
      return;
    }
    if (header.length > 100000) { res.status(400).json({ error: "Payment header too large." }); return; }
    const payload = PaymentPayloadV2Schema.parse(JSON.parse(Buffer.from(header,"base64").toString("utf8"))) as unknown as PaymentPayload;
    const authDigest = digest(payload);
    const key = mode === "durable" ? "durable:" + id : "naive:" + id + ":" + authDigest;
    const fault = req.get("X-Chaos-Fault") ?? "none";
    if (!["none","drop","crash"].includes(fault)) { res.status(400).json({ error: "Unsupported fault." }); return; }
    await queue.run(async () => {
      let purchase = store.get(key);
      const isRetry = Boolean(purchase);
      if (purchase && (purchase.bodyHash !== bodyHash || purchase.authDigest !== authDigest)) {
        res.status(409).json({ error: "Purchase already exists. Reuse its original body and payment payload; do not create a new authorization." }); return;
      }
      if (!purchase) {
        const verification = await resource.verifyPayment(payload,requirements);
        if (!verification.isValid || !verification.payer) { res.status(402).json({ error: "Payment verification rejected." }); return; }
        store.insert({ key, purchaseId: id, mode, bodyHash, authDigest, buyer: verification.payer });
        purchase = store.get(key)!;
        try {
          const settlement = await resource.settlePayment(payload,requirements);
          store.update(key, settlement.success ? "SETTLED" : "UNKNOWN",settlement.transaction ?? "", null);
        } catch { store.update(key,"UNKNOWN","",null); }
        purchase = store.get(key)!;
      }
      if (!purchase.txHash) {
        const known = await receipt(authDigest);
        if (known.transaction) {
          store.update(key,"UNKNOWN",known.transaction,purchase.result);
          purchase = store.get(key)!;
        }
      }
      const expected = { tokenContract: c.token, from: purchase.buyer, to: c.recipient, amountAtomic: c.amount };
      const evidence = await observe(observer,purchase.txHash,expected);
      if (evidence.status !== "CONFIRMED") {
        store.update(key,evidence.status,purchase.txHash,purchase.result);
        res.status(202).json({ purchaseId: id, status: evidence.status, reason: evidence.reason, txHash: purchase.txHash, retry: "Reuse the original payment payload; never automatically reauthorize." }); return;
      }
      store.update(key,"SETTLED",purchase.txHash,purchase.result);
      // A controlled crash after confirmed settlement, before result storage.
      // The facilitator journal retains the hash even if the merchant dies before recording it.
      if (!isRetry && fault === "crash") process.exit(86);
      const csv = purchase.result ?? toCsv(rows);
      store.update(key,"DELIVERY_STORED",purchase.txHash,csv);
      if (!isRetry && fault === "drop") { req.socket.destroy(); return; }
      res.setHeader("PAYMENT-RESPONSE",Buffer.from(JSON.stringify({ success: true, network: NETWORK, transaction: purchase.txHash, payer: purchase.buyer })).toString("base64"));
      res.json({ purchaseId: id, mode, txHash: purchase.txHash, recovered: isRetry, csv, csvHash: digest(csv), evidence });
    });
  } catch (error) { next(error); }
});
app.post("/purchases/:id/ack",(req,res) => {
  try {
    const header = req.get("PAYMENT-SIGNATURE");
    if (!header) { res.status(401).json({ error: "Original authorization required." }); return; }
    const payload = PaymentPayloadV2Schema.parse(JSON.parse(Buffer.from(header,"base64").toString("utf8")));
    const authDigest = digest(payload);
    const mode = req.query.mode === "naive" ? "naive" : "durable";
    const key = mode === "durable" ? "durable:" + req.params.id : "naive:" + req.params.id + ":" + authDigest;
    const purchase = store.get(key);
    if (!purchase?.result || purchase.authDigest !== authDigest || req.body?.csvHash !== digest(purchase.result)) {
      res.status(409).json({ error: "Result acknowledgment does not match this purchase." }); return;
    }
    store.delivered(key);
    res.json({ acknowledged: true });
  } catch { res.status(400).json({ error: "Invalid acknowledgment." }); }
});
app.get("/reports/:id",async (req,res) => {
  const mode = req.query.mode === "naive" ? "naive" : "durable";
  const purchases = store.list(req.params.id,mode);
  if (!purchases.length) { res.status(404).json({ error: "Unknown purchase." }); return; }
  const first = purchases[0]!;
  const expected = { tokenContract: c.token, from: first.buyer, to: c.recipient, amountAtomic: c.amount };
  const observations: Observation[] = [];
  for (const p of purchases) {
    const known = p.txHash ? { transaction: p.txHash } : await receipt(p.authDigest);
    observations.push(await observe(observer, known.transaction ?? "", expected));
  }
  const responseRecovered = purchases.some(p => p.deliveries > 0);
  const report: PurchaseReport = {
    schemaVersion: 1, purchaseId: req.params.id, mode, network: NETWORK,
    tokenContract: c.token, expectedAmountAtomic: c.amount,
    responseRecovered, ...verdict(observations,expected,responseRecovered),
  };
  res.json({ ...report, observations, attempts: purchases.map(p => ({ state: p.state, txHash: p.txHash, deliveries: p.deliveries })) });
});
const errors: ErrorRequestHandler = (error,_req,res,_next) => {
  const invalid = error instanceof SyntaxError || error?.name === "ZodError" || error?.message?.startsWith("Expected ");
  res.status(invalid ? 400 : 503).json({ error: invalid ? "Invalid request." : "Operation interrupted. Preserve original payload and reconcile; do not pay again." });
};
app.use(errors);
app.listen(Number(process.env.MERCHANT_PORT ?? 3001),"127.0.0.1", () => console.log("Merchant: " + c.merchantUrl + " (Testnet only)"));
