import { Asset, Horizon, Keypair, Networks } from "@stellar/stellar-sdk";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { assertTestnet, HORIZON_URL, RPC_URL } from "../apps/demo-merchant/src/config.js";

assertTestnet();
if (existsSync(".env")) throw new Error(".env already exists. Preserved; use npm run check:connections.");
const buyer = Keypair.random();
const merchant = Keypair.random();
const facilitator = Keypair.random();
mkdirSync(".local", { recursive: true });
const lines = [
  "STELLAR_NETWORK=stellar:testnet", "STELLAR_RPC_URL=" + RPC_URL,
  "STELLAR_HORIZON_URL=" + HORIZON_URL,
  "FACILITATOR_URL=http://127.0.0.1:4022", "MERCHANT_URL=http://127.0.0.1:3001",
  "MERCHANT_PORT=3001", "FACILITATOR_PORT=4022",
  "FACILITATOR_SECRET=" + facilitator.secret(), "BUYER_SECRET=" + buyer.secret(),
  "MERCHANT_ADDRESS=" + merchant.publicKey(),
  "TOKEN_CONTRACT=" + Asset.native().contractId(Networks.TESTNET),
  "PAYMENT_AMOUNT_ATOMIC=100000", "DATABASE_PATH=.local/merchant.sqlite",
];
// Save secrets before network calls; never print them. Merchant is receive-only in this demo.
writeFileSync(".env", lines.join("\n") + "\n", { flag: "wx", mode: 0o600 });
writeFileSync(".local/merchant-secret.txt", merchant.secret() + "\n", { flag: "wx", mode: 0o600 });
const horizon = new Horizon.Server(HORIZON_URL);
for (const [role, key] of [["buyer", buyer], ["merchant", merchant], ["facilitator", facilitator]] as const) {
  console.log(role + ": " + key.publicKey());
  const response = await fetch("https://friendbot.stellar.org/?addr=" + key.publicKey(), { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error("Friendbot failed for " + role + ". Rerun funding from the public address; .env is preserved.");
  const account = await horizon.loadAccount(key.publicKey());
  console.log("  Testnet funded: " + account.balances.find(b => b.asset_type === "native")?.balance + " XLM");
}
console.log("Local Testnet configuration written. No AI API key or external facilitator key is needed.");
