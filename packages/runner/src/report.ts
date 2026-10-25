import type { PurchaseReport, Transfer } from '../../evidence/src/index.js';

export type Source = 'SIMULATED' | 'TESTNET' | 'ARCHIVE';
export interface Event { at: string; kind: string; message: string; }
export interface Run {
  runId: string; scenario: string; source: Source; status: 'RUNNING' | 'COMPLETE' | 'INTERRUPTED';
  startedAt: string; timeline: Event[]; reports: PurchaseReport[];
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid report object');
  return v as Record<string, unknown>;
};
const string = (v: unknown) => { if (typeof v !== 'string') throw new Error('Invalid report string'); return v; };
const atomic = (v: unknown) => { const s = string(v); if (!/^\d+$/.test(s)) throw new Error('Invalid atomic amount'); return s; };

// Explicit allowlist: engine extensions, authorizations, request bodies and secrets never leave this boundary.
export function publicReport(value: unknown): PurchaseReport {
  const r = object(value);
  if (r.schemaVersion !== 1 || r.network !== 'stellar:testnet' || !['durable', 'naive'].includes(String(r.mode))) throw new Error('Unsupported report');
  if (!['PASS', 'FAIL', 'UNKNOWN', 'UNSUPPORTED'].includes(String(r.verdict)) || typeof r.responseRecovered !== 'boolean' || !Array.isArray(r.transfers)) throw new Error('Invalid report');
  const transfers: Transfer[] = r.transfers.map(value => {
    const t = object(value);
    if (!Number.isSafeInteger(t.ledger) || Number(t.ledger) < 0) throw new Error('Invalid ledger');
    return { txHash: string(t.txHash), tokenContract: string(t.tokenContract), from: string(t.from), to: string(t.to), amountAtomic: atomic(t.amountAtomic), ledger: Number(t.ledger) };
  });
  const report: PurchaseReport = {
    schemaVersion: 1, purchaseId: string(r.purchaseId), mode: r.mode as PurchaseReport['mode'], network: 'stellar:testnet',
    tokenContract: string(r.tokenContract), expectedAmountAtomic: atomic(r.expectedAmountAtomic), settledAmountAtomic: atomic(r.settledAmountAtomic),
    transfers, responseRecovered: r.responseRecovered, verdict: r.verdict as PurchaseReport['verdict'],
    reason: 'Verdict reported by the independent engine observer.',
  };
  // A successful HTTP response alone can never become a PASS.
  if (report.verdict === 'PASS' && (!report.responseRecovered || transfers.length !== 1 ||
      transfers[0]!.tokenContract !== report.tokenContract || transfers[0]!.amountAtomic !== report.expectedAmountAtomic ||
      report.settledAmountAtomic !== report.expectedAmountAtomic || !transfers[0]!.txHash || !transfers[0]!.from || !transfers[0]!.to)) {
    report.verdict = 'UNKNOWN'; report.reason = 'Insufficient evidence for the claimed PASS.';
  }
  return report;
}

export function event(run: Run, kind: string, message: string) {
  run.timeline.push({ at: new Date().toISOString(), kind, message });
}
