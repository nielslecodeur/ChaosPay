import express from "express";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { AsyncLocalStorage } from "node:async_hooks";
import { TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { x402Facilitator } from "@x402/core/facilitator";
import { PaymentPayloadV2Schema, PaymentRequirementsV2Schema } from "@x402/core/schemas";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/facilitator";
import { digest } from "../../../packages/evidence/src/index.js";
import { config, NETWORK, PASSPHRASE, RPC_URL, secret } from "./config.js";
import { Queue, Store } from "./store.js";

const c = config();
const journal = new Store(".local/facilitator.sqlite");
const queue = new Queue();
const context = new AsyncLocalStorage<string>();
const signer = createEd25519Signer(secret("FACILITATOR_SECRET"), NETWORK);
const originalSign = signer.signTransaction.bind(signer);
signer.signTransaction = async (tx, options) => {
  const id = context.getStore();
  if (!id) throw new Error("Missing durable settlement context.");
  const hash = TransactionBuilder.fromXDR(tx, PASSPHRASE).hash().toString("hex");
  // Persist hash before returning the signed transaction to the SDK, before broadcast.
  journal.db.prepare("UPDATE settlements SET txHash=? WHERE digest=?").run(hash,id);
  return originalSign(tx, options);
};
const facilitator = new x402Facilitator().register(NETWORK, new ExactStellarScheme([signer], { rpcConfig: { url: RPC_URL }, maxTransactionFeeStroops: 1000000 }));
const rpcServer = new rpc.Server(RPC_URL);
const app = express();
app.use(express.json({ limit: "128kb" }));
app.get("/health", (_,res) => res.json({ status: "ok", network: NETWORK }));
app.get("/supported", (_,res) => res.json(facilitator.getSupported()));
function parse(body: Record<string, unknown>) {
  const paymentPayload = PaymentPayloadV2Schema.parse(body?.paymentPayload) as unknown as PaymentPayload;
  const paymentRequirements = PaymentRequirementsV2Schema.parse(body?.paymentRequirements) as unknown as PaymentRequirements;
  if (paymentRequirements.network !== NETWORK || paymentRequirements.asset !== c.token || paymentRequirements.payTo !== c.recipient || paymentRequirements.amount !== c.amount)
    throw new Error("Payment outside this demo configuration.");
  return { paymentPayload, paymentRequirements };
}
app.post("/verify", async (req,res) => {
  try { const p = parse(req.body); res.json(await facilitator.verify(p.paymentPayload,p.paymentRequirements)); }
  catch { res.status(400).json({ error: "Invalid payment request." }); }
});
interface Receipt { digest: string; payer: string; txHash: string; result: string | null; }
async function recover(row: Receipt) {
  if (row.result) return JSON.parse(row.result);
  if (row.txHash) {
    const tx = await rpcServer.getTransaction(row.txHash);
    if (tx.status === "SUCCESS") return { success: true, transaction: row.txHash, payer: row.payer, network: NETWORK };
  }
  return { success: false, transaction: row.txHash, payer: row.payer, network: NETWORK, errorReason: "settlement_unknown" };
}
app.get("/receipts/:digest", async (req,res) => {
  const row = journal.db.prepare("SELECT * FROM settlements WHERE digest=?").get(req.params.digest) as unknown as Receipt | undefined;
  if (!row) { res.status(404).json({ error: "No receipt; not proof of nonpayment." }); return; }
  try { res.json(await recover(row)); } catch { res.status(503).json({ error: "Receipt temporarily unavailable." }); }
});
app.post(["/settle","/submit"], async (req,res) => {
  try {
    const p = parse(req.body);
    const id = digest(p.paymentPayload);
    let accepted!: () => void;
    let rejected!: (e: unknown) => void;
    const ready = new Promise<void>((resolve,reject) => { accepted=resolve; rejected=reject; });
    void ready.catch(() => {});
    const pending = queue.run(async () => {
      const previous = journal.db.prepare("SELECT * FROM settlements WHERE digest=?").get(id) as unknown as Receipt | undefined;
      if (previous) { accepted!(); return recover(previous); } // Never resubmit an uncertain settlement.
      const verification = await facilitator.verify(p.paymentPayload,p.paymentRequirements);
      if (!verification.isValid || !verification.payer) throw new Error("Verification failed");
      journal.db.prepare("INSERT INTO settlements(digest,payer) VALUES(?,?)").run(id,verification.payer);
      accepted!();
      const result = await context.run(id, () => facilitator.settle(p.paymentPayload,p.paymentRequirements));
      if (result.success) journal.db.prepare("UPDATE settlements SET result=? WHERE digest=?").run(JSON.stringify(result),id);
      return result;
    });
    if (req.path === "/submit") {
      void pending.catch(rejected);
      await ready;
      res.status(202).json({status:"UNKNOWN"});
    } else res.json(await pending);
  } catch { res.status(503).json({ error: "Settlement unknown; consult the durable receipt before retrying." }); }
});
const port = Number(process.env.FACILITATOR_PORT ?? 4022);
app.listen(port,"127.0.0.1", () => console.log("Facilitator: http://127.0.0.1:" + port + " (Testnet only)"));
