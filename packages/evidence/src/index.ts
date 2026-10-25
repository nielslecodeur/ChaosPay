import { createHash } from "node:crypto";
export type Verdict = "PASS" | "FAIL" | "UNKNOWN" | "UNSUPPORTED";
export interface Transfer {
  txHash: string; tokenContract: string; from: string; to: string;
  amountAtomic: string; ledger: number;
}
export interface PaymentExpectation { tokenContract: string; from: string; to: string; amountAtomic: string; }
export interface Observation { reasonCode?: "HASH_MISSING" | "NOT_FOUND" | "RPC_UNAVAILABLE" | "RPC_RESPONSE_UNREADABLE"; status: "CONFIRMED" | "FAILED" | "UNKNOWN" | "UNSUPPORTED"; txHash: string; transfers: Transfer[]; reason: string; }
export interface PurchaseReport {
  serviceId?: string; recoveryMs?: number | null; unknownObservations?: number;
  schemaVersion: 1; purchaseId: string; mode: "naive" | "durable"; network: "stellar:testnet";
  tokenContract: string; expectedAmountAtomic: string; settledAmountAtomic: string;
  transfers: Transfer[]; responseRecovered: boolean; verdict: Verdict; reason: string;
}
export function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function matches(t: Transfer, e: PaymentExpectation) {
  return t.tokenContract === e.tokenContract && t.from === e.from && t.to === e.to && t.amountAtomic === e.amountAtomic;
}
export function verdict(observations: Observation[], e: PaymentExpectation, recovered: boolean): Pick<PurchaseReport, "verdict" | "reason" | "transfers" | "settledAmountAtomic"> {
  const unique = new Map<string, Observation>();
  for (const observation of observations) unique.set(observation.txHash, observation);
  const all = [...unique.values()];
  const transfers = all.flatMap(o => o.transfers);
  const paid = transfers.filter(t => t.tokenContract === e.tokenContract && t.from === e.from && t.to === e.to);
  const total = paid.reduce((sum, t) => sum + BigInt(t.amountAtomic), 0n).toString();
  const base = { transfers, settledAmountAtomic: total };
  if (BigInt(total) > BigInt(e.amountAtomic)) return { ...base, verdict: "FAIL", reason: "Confirmed payments exceed the price of one logical purchase." };
  if (!all.length || all.some(o => o.status === "UNKNOWN")) return { ...base, verdict: "UNKNOWN", reason: "Payment observation is incomplete." };
  if (all.some(o => o.status === "UNSUPPORTED")) return { ...base, verdict: "UNSUPPORTED", reason: "Transfer events cannot be interpreted." };
  if (!recovered && paid.length === 1 && matches(paid[0]!, e) && all.every(o => o.status === "CONFIRMED")) return { ...base, verdict: "UNKNOWN", reason: "Payment confirmed; client acknowledgment missing." };
  if (paid.length === 1 && matches(paid[0]!, e) && recovered && all.every(o => o.status === "CONFIRMED"))
    return { ...base, verdict: "PASS", reason: "One expected payment confirmed and result recovered." };
  return { ...base, verdict: "FAIL", reason: "Payment or result does not satisfy the purchase invariant." };
}
