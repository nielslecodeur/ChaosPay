import { digest, verdict, type Observation, type PaymentExpectation, type PurchaseReport } from "../../evidence/src/index.js";
import { Store, Queue, type Purchase } from "./store.js";
export { Store } from "./store.js";

export interface PaymentGateway<P> {
  verify(payload: P): Promise<{ isValid: boolean; payer?: string }>;
  settle(payload: P, withoutConfirmation: boolean): Promise<{ transaction?: string; success?: boolean }>;
  receipt(authDigest: string): Promise<{ transaction?: string }>;
  observe(txHash: string, expected: PaymentExpectation): Promise<Observation>;
}
export const faults = ["none","before-submit","confirmation-lost","crash","drop","ack-lost"] as const;
export type Fault = typeof faults[number];
export class RecoveryError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export class FaultTriggered extends Error {
  constructor(public readonly fault: "before-submit" | "crash" | "drop") { super(fault); }
}
export interface RecoveryInput<P,I> { purchaseId: string; mode: "durable" | "naive"; payload: P; input: I; fault?: Fault; }
export interface RecoveryOptions<P,I,O> {
  store: Store; gateway: PaymentGateway<P>; serviceId: string;
  tokenContract: string; recipient: string; amountAtomic: string;
  produce: (input: I, context: { purchaseId: string; txHash: string; buyer: string }) => O | Promise<O>;
}
export class RecoveryKit<P,I,O> {
  private queue = new Queue();
  constructor(private readonly options: RecoveryOptions<P,I,O>) {}
  private key(id: string, mode: string, authDigest: string) {
    return this.options.serviceId + ":" + mode + ":" + id + (mode === "naive" ? ":" + authDigest : "");
  }
  private expected(p: Purchase): PaymentExpectation {
    return { tokenContract: this.options.tokenContract, from: p.buyer, to: this.options.recipient, amountAtomic: this.options.amountAtomic };
  }
  execute(request: RecoveryInput<P,I>) {
    return this.queue.run(async () => {
      const { store, gateway } = this.options;
      const authDigest = digest(request.payload), bodyHash = digest(request.input);
      const key = this.key(request.purchaseId,request.mode,authDigest);
      const fault = request.fault ?? "none";
      let p = store.get(key), fresh = !p;
      if (!p) {
        const verification = await gateway.verify(request.payload);
        if (!verification.isValid || !verification.payer) throw new RecoveryError(402,"Payment verification rejected.");
        try {
          store.insert({ key, purchaseId: request.purchaseId, mode: request.mode, bodyHash, authDigest, buyer: verification.payer });
        } catch {
          fresh = false; // Another instance may have atomically claimed this purchase.
          if (!store.get(key)) throw new RecoveryError(409,"Authorization already attached to another purchase.");
        }
        p = store.get(key)!;
      }
      if (p.bodyHash !== bodyHash || p.authDigest !== authDigest)
        throw new RecoveryError(409,"Reuse the original purchase body and payment payload.");
      if (fresh && fault === "before-submit") {
        store.interrupted(key);
        throw new FaultTriggered("before-submit");
      }
      // The durable claim prevents concurrent instances from settling this purchase twice.
      // A crash after this claim but before network submission remains UNKNOWN unless a receipt exists.
      if (store.claimSubmission(key)) {
        try {
          const settlement = await gateway.settle(request.payload,fault === "confirmation-lost");
          store.update(key,settlement.success ? "SETTLED" : "UNKNOWN",settlement.transaction ?? "",p.result);
        } catch { store.update(key,"UNKNOWN","",p.result); }
        if (fault === "confirmation-lost") {
          store.unknown(key);
          return { status: "UNKNOWN" as const, reason: "Settlement sent to facilitator; confirmation intentionally unavailable.", txHash: store.get(key)!.txHash };
        }
      }
      p = store.get(key)!;
      if (!p.txHash) {
        const receipt = await gateway.receipt(authDigest).catch(() => ({} as { transaction?: string }));
        if (receipt.transaction) { store.update(key,"UNKNOWN",receipt.transaction,p.result); p = store.get(key)!; }
      }
      const evidence = await gateway.observe(p.txHash,this.expected(p));
      if (evidence.status !== "CONFIRMED") {
        store.update(key,evidence.status,p.txHash,p.result);
        if (evidence.status === "UNKNOWN") store.unknown(key);
        return { status: evidence.status, reason: evidence.reason, txHash: p.txHash };
      }
      store.update(key,"SETTLED",p.txHash,p.result);
      if (fresh && fault === "crash") { store.interrupted(key); throw new FaultTriggered("crash"); }
      const result: O = p.result === null
        ? await this.options.produce(request.input,{ purchaseId: request.purchaseId, txHash: p.txHash, buyer: p.buyer })
        : JSON.parse(p.result) as O;
      const serialized = JSON.stringify(result);
      if (serialized === undefined) throw new Error("Result must be JSON serializable.");
      store.update(key,"DELIVERY_STORED",p.txHash,serialized);
      if (fresh && fault === "drop") { store.interrupted(key); throw new FaultTriggered("drop"); }
      if (fault === "ack-lost") store.interrupted(key);
      return { status: "READY" as const, txHash: p.txHash, recovered: !fresh, result, resultHash: digest(result), evidence };
    });
  }
  acknowledge(id: string, mode: string, payload: P, resultHash: string) {
    const authDigest = digest(payload);
    const key = this.key(id,mode,authDigest);
    const p = this.options.store.get(key);
    if (!p || p.result === null || p.authDigest !== authDigest || digest(JSON.parse(p.result)) !== resultHash)
      throw new RecoveryError(409,"Result acknowledgment does not match this purchase.");
    this.options.store.delivered(key);
  }
  async report(id: string, mode: "durable" | "naive"): Promise<PurchaseReport & { observations: Observation[]; attempts: { state: string; txHash: string; deliveries: number }[] }> {
    const { store, gateway } = this.options;
    const purchases = store.list(id,mode).filter(p => p.key.startsWith(this.options.serviceId + ":"));
    if (!purchases.length) throw new RecoveryError(404,"Unknown purchase.");
    const expected = this.expected(purchases[0]!);
    const observations: Observation[] = [];
    for (const p of purchases) {
      const known = p.txHash ? { transaction: p.txHash } : await gateway.receipt(p.authDigest).catch(() => ({} as { transaction?: string }));
      observations.push(await gateway.observe(known.transaction ?? "",expected));
    }
    const responseRecovered = purchases.some(p => p.deliveries > 0);
    const interruptions = purchases.map(p => p.interruptedAt).filter((n): n is number => n !== null);
    const acknowledgments = purchases.map(p => p.acknowledgedAt).filter((n): n is number => n !== null);
    const recoveryMs = interruptions.length && acknowledgments.length ? Math.max(0,Math.max(...acknowledgments)-Math.min(...interruptions)) : null;
    return {
      schemaVersion: 1, purchaseId: id, mode, network: "stellar:testnet", serviceId: this.options.serviceId,
      tokenContract: expected.tokenContract, expectedAmountAtomic: expected.amountAtomic,
      responseRecovered, ...verdict(observations,expected,responseRecovered),
      recoveryMs, unknownObservations: purchases.reduce((n,p) => n+p.unknownObservations,0),
      observations, attempts: purchases.map(p => ({ state:p.state,txHash:p.txHash,deliveries:p.deliveries })),
    };
  }
}
