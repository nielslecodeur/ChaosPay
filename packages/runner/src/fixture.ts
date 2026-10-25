import { randomUUID } from 'node:crypto';
import type { PurchaseReport } from '../../evidence/src/index.js';
import { event, type Run } from './report.js';
import type { Scenario } from '../../../scenarios/index.js';

export function simulate(scenario: Scenario): Run {
  const run: Run = { runId: randomUUID(), scenario, source: 'SIMULATED', status: 'COMPLETE', startedAt: new Date().toISOString(), timeline: [], reports: [] };
  event(run, 'simulation', 'SIMULATED — no processes started and no payment made.');
  for (const mode of scenario === 'comparison' ? ['durable', 'naive'] as const : ['durable'] as const) {
    const count = mode === 'naive' ? 2 : 1;
    const report: PurchaseReport = { schemaVersion: 1, purchaseId: `sim-${mode}-${run.runId}`, mode, network: 'stellar:testnet',
      tokenContract: 'SIMULATED-XLM', expectedAmountAtomic: '100000', settledAmountAtomic: String(count * 100000),
      transfers: Array.from({ length: count }, (_, i) => ({ txHash: `SIMULATED-${mode}-${i}`, tokenContract: 'SIMULATED-XLM', from: 'SIMULATED-BUYER', to: 'SIMULATED-MERCHANT', amountAtomic: '100000', ledger: 0 })),
      responseRecovered: true, verdict: count === 1 ? 'PASS' : 'FAIL', reason: 'SIMULATED — educational result, no network evidence.' };
    event(run, 'simulation', `${mode}: HTTP 402 challenge followed by simulated settlement.`);
    if (scenario !== 'baseline') event(run, 'simulation', `${mode}: simulated ${scenario === 'concurrent' ? 'two concurrent requests' : 'interruption and recovery'}.`);
    event(run, 'simulation', `${mode}: ${count} fictional transfer(s); result acknowledgment simulated.`);
    run.reports.push(report);
  }
  return run;
}
