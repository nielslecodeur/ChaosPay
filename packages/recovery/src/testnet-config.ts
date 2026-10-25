import { Asset, Keypair, Networks, StrKey } from "@stellar/stellar-sdk";

export const NETWORK = "stellar:testnet" as const;
export const PASSPHRASE = Networks.TESTNET;
export const RPC_URL = "https://soroban-testnet.stellar.org";
export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export function assertTestnet() {
  if (process.env.STELLAR_NETWORK && process.env.STELLAR_NETWORK !== NETWORK)
    throw new Error("ChaosPay only supports stellar:testnet.");
  if (process.env.STELLAR_RPC_URL && process.env.STELLAR_RPC_URL !== RPC_URL)
    throw new Error("MVP requires the public Stellar Testnet RPC.");
  if (process.env.STELLAR_HORIZON_URL && process.env.STELLAR_HORIZON_URL !== HORIZON_URL)
    throw new Error("MVP requires the public Stellar Testnet Horizon.");
}
export function secret(name: string): string {
  const value = process.env[name];
  if (!value || !StrKey.isValidEd25519SecretSeed(value)) throw new Error(name + " missing or invalid. Run npm run setup:testnet.");
  return value;
}
export function config() {
  assertTestnet();
  const recipient = process.env.MERCHANT_ADDRESS;
  if (!recipient || !StrKey.isValidEd25519PublicKey(recipient)) throw new Error("MERCHANT_ADDRESS missing.");
  const token = process.env.TOKEN_CONTRACT ?? Asset.native().contractId(PASSPHRASE);
  if (token !== Asset.native().contractId(PASSPHRASE)) throw new Error("This MVP only supports the native XLM Testnet SAC.");
  const amount = process.env.PAYMENT_AMOUNT_ATOMIC ?? "100000";
  if (!/^[1-9][0-9]*$/.test(amount) || BigInt(amount) > 10000000n) throw new Error("Amount must be 1..10000000 atomic XLM.");
  const facilitatorUrl = process.env.FACILITATOR_URL ?? "http://127.0.0.1:4022";
  const merchantUrl = process.env.MERCHANT_URL ?? "http://127.0.0.1:3001";
  for (const raw of [facilitatorUrl, merchantUrl]) {
    const url = new URL(raw);
    if (url.hostname !== "127.0.0.1" || url.protocol !== "http:") throw new Error("Demo servers must use http://127.0.0.1.");
  }
  return { recipient, token, amount, facilitatorUrl, merchantUrl, databasePath: process.env.DATABASE_PATH ?? ".local/merchant.sqlite" };
}
export function buyerAddress() { return Keypair.fromSecret(secret("BUYER_SECRET")).publicKey(); }
