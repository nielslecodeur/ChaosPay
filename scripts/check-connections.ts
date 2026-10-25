import { Horizon, Keypair, rpc } from "@stellar/stellar-sdk";
import { config, secret, NETWORK, PASSPHRASE, RPC_URL, HORIZON_URL } from "../apps/demo-merchant/src/config.js";
const c = config();
const server = new rpc.Server(RPC_URL);
const network = await server.getNetwork();
if (network.passphrase !== PASSPHRASE) throw new Error("RPC passphrase mismatch.");
console.log("RPC: " + NETWORK + ", passphrase verified.");
console.log("Ledger: " + (await server.getLatestLedger()).sequence);
const horizon = new Horizon.Server(HORIZON_URL);
for (const [role, address] of [
  ["buyer", Keypair.fromSecret(secret("BUYER_SECRET")).publicKey()],
  ["merchant", c.recipient],
  ["facilitator", Keypair.fromSecret(secret("FACILITATOR_SECRET")).publicKey()],
]) {
  const account = await horizon.loadAccount(address!);
  console.log(role + ": " + address + " funded=" + account.balances.some(b => b.asset_type === "native" && Number(b.balance) > 2));
}
console.log("Asset: native XLM Testnet SAC " + c.token + "; price=" + c.amount + " atomic units (7 decimals).");
