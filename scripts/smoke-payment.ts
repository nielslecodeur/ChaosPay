import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { x402Client } from "@x402/core/client";
import { PaymentRequiredV2Schema } from "@x402/core/schemas";
import type { PaymentPayload, PaymentRequired } from "@x402/core/types";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { digest } from "../packages/evidence/src/index.js";
import { config, secret, NETWORK, RPC_URL } from "../apps/demo-merchant/src/config.js";
import { filePaths, LEGACY_SMOKE_BODY } from "../packages/client-recovery/src/local-files.js";

const c = config();
const id = process.argv[2] ?? "purchase-" + Date.now();
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error("Invalid purchase ID.");
const mode = process.argv[3] ?? "durable";
if (!["durable","naive"].includes(mode)) throw new Error("Mode must be durable or naive.");
const fault = process.argv[4] ?? "none";
if (!["none","drop","crash"].includes(fault)) throw new Error("Fault must be none, drop or crash.");
const fresh = process.argv.includes("--new-authorization");
if (fresh && mode !== "naive") throw new Error("New authorization is only allowed for deliberately naive mode.");
const url = c.merchantUrl + "/purchases/" + id + "?mode=" + mode;
const body = LEGACY_SMOKE_BODY;
const cache = ".local/client-" + mode + "-" + id + ".json";
let payload: PaymentPayload;
if (existsSync(cache) && !fresh) {
  payload = JSON.parse(readFileSync(cache,"utf8"));
  console.log("Reusing original payment authorization for " + id);
} else {
  const unpaid = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (unpaid.status !== 402) throw new Error("Expected 402, got " + unpaid.status);
  const challenge = PaymentRequiredV2Schema.parse(await unpaid.json());
  const accepted = challenge.accepts;
  if (accepted.length !== 1 || accepted[0]!.network !== NETWORK || accepted[0]!.asset !== c.token || accepted[0]!.amount !== c.amount || accepted[0]!.payTo !== c.recipient)
    throw new Error("Unexpected payment terms.");
  const client = x402Client.fromConfig({ schemes: [{ network: NETWORK, client: new ExactStellarScheme(createEd25519Signer(secret("BUYER_SECRET"),NETWORK), { url: RPC_URL }) }], spendControls: { allowedAssets: [{ network: NETWORK, asset: c.token, maxAmountPerPayment: c.amount }] } });
  payload = await client.createPaymentPayload(challenge as unknown as PaymentRequired);
  mkdirSync(".local",{ recursive: true });
  writeFileSync(cache,JSON.stringify(payload),{ mode: 0o600 });
}
mkdirSync(".local",{ recursive: true });
writeFileSync(filePaths(".local",mode as "durable" | "naive",id).request,JSON.stringify({
  application: "csv", merchantUrl: c.merchantUrl, path: "/purchases/" + id + "?mode=" + mode, body,
},null,2) + "\n",{ mode: 0o600 });
try {
  async function send() {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64"), "X-Chaos-Fault": fault },
      body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
    });
    const result = await response.json() as Record<string, unknown>;
    if (response.status === 200) {
      if (typeof result.csv !== "string" || digest(result.csv) !== result.csvHash) throw new Error("Result hash mismatch.");
      const ack = await fetch(c.merchantUrl + "/purchases/" + id + "/ack?mode=" + mode, {
        method: "POST", headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64") },
        body: JSON.stringify({ csvHash: result.csvHash }), signal: AbortSignal.timeout(10000),
      });
      if (!ack.ok) throw new Error("Acknowledgment failed.");
    }
    console.log(JSON.stringify({ httpStatus: response.status, ...result },null,2));
    if (response.status !== 200) process.exitCode = 1;
  }
  if (process.argv.includes("--concurrent")) await Promise.all([send(),send()]);
  else await send();
} catch {
  console.log("Connection interrupted. Keep purchaseId " + id + ". Resume it with: npm run recover -- " + id);
  process.exitCode = 2;
}
const report = await fetch(c.merchantUrl + "/reports/" + id + "?mode=" + mode, { signal: AbortSignal.timeout(20000) }).then(r => r.json()).catch(() => null);
if (report) {
  const filename = ".local/report-" + mode + "-" + id + ".json";
  writeFileSync(filename,JSON.stringify(report,null,2) + "\n");
  console.log("Report: " + filename);
}
