import { rpc, scValToNative, StrKey, xdr } from "@stellar/stellar-sdk";
import { matches, type Observation, type PaymentExpectation, type Transfer } from "../../evidence/src/index.js";

export function decodeTransfers(events: xdr.ContractEvent[], txHash: string, ledger: number): Transfer[] {
  const transfers: Transfer[] = [];
  for (const event of events) {
    const id = event.contractId();
    if (!id || event.type().name !== "contract") continue;
    const value = event.body().v0();
    const topics = value.topics().map(t => scValToNative(t));
    if (topics[0] !== "transfer" || typeof topics[1] !== "string" || typeof topics[2] !== "string") continue;
    const data = scValToNative(value.data());
    // SEP-41 transfer: data is i128 (older versions) or a map with amount (newer SAC).
    const amount = typeof data === "bigint" ? data : data?.amount;
    if (typeof amount !== "bigint") continue;
    transfers.push({ txHash, ledger, tokenContract: StrKey.encodeContract(Buffer.from(id as unknown as Uint8Array)), from: topics[1], to: topics[2], amountAtomic: amount.toString() });
  }
  return transfers;
}
export async function observe(server: Pick<rpc.Server, "getTransaction">, txHash: string, expected: PaymentExpectation): Promise<Observation> {
  if (!/^[a-f0-9]{64}$/i.test(txHash)) return { status: "UNKNOWN", txHash, transfers: [], reasonCode:"HASH_MISSING", reason: "No valid transaction hash." };
  let tx: Awaited<ReturnType<typeof server.getTransaction>>;
  try { tx = await server.getTransaction(txHash); }
  catch { return {status:"UNKNOWN",txHash,transfers:[],reasonCode:"RPC_UNAVAILABLE",reason:"Observer RPC unavailable."}; }
  try {
    if (tx.status === "NOT_FOUND") return { status: "UNKNOWN", txHash, transfers: [], reasonCode:"NOT_FOUND", reason: "Not found in this RPC observation window; not proof of failure." };
    if (tx.status === "FAILED") return { status: "FAILED", txHash, transfers: [], reason: "Ledger confirmed failure." };
    const transfers = decodeTransfers(tx.events.contractEventsXdr.flat(), txHash, tx.ledger);
    return {
      status: transfers.some(t => matches(t, expected)) ? "CONFIRMED" : transfers.length ? "FAILED" : "UNSUPPORTED",
      txHash, transfers, reason: transfers.some(t => matches(t, expected)) ? "Exact transfer confirmed from contract events." : "No matching supported transfer event.",
    };
  } catch {
    return { status: "UNKNOWN", txHash, transfers: [], reasonCode:"RPC_RESPONSE_UNREADABLE", reason: "Observer response could not be decoded." };
  }
}
