import { randomUUID } from 'node:crypto';
import type { PurchaseReport } from '../../evidence/src/index.js';
import { event, type Run } from './report.js';
import type { Scenario } from '../../../scenarios/index.js';

export function simulate(scenario: Scenario): Run {
  const run: Run = { runId: randomUUID(), scenario, source: 'SIMULATED', status: 'COMPLETE', startedAt: new Date().toISOString(), timeline: [], reports: [] };
  event(run, 'simulation', 'SIMULATED — aucun processus lancé, aucun paiement effectué.');
  for (const mode of scenario === 'comparison' ? ['durable', 'naive'] as const : ['durable'] as const) {
    const count = mode === 'naive' ? 2 : 1;
    const report: PurchaseReport = { schemaVersion: 1, purchaseId: `sim-${mode}-${run.runId}`, mode, network: 'stellar:testnet',
      tokenContract: 'SIMULATED-XLM', expectedAmountAtomic: '100000', settledAmountAtomic: String(count * 100000),
      transfers: Array.from({ length: count }, (_, i) => ({ txHash: `SIMULATED-${mode}-${i}`, tokenContract: 'SIMULATED-XLM', from: 'SIMULATED-BUYER', to: 'SIMULATED-MERCHANT', amountAtomic: '100000', ledger: 0 })),
      responseRecovered: true, verdict: count === 1 ? 'PASS' : 'FAIL', reason: 'SIMULATED — résultat pédagogique, sans preuve réseau.' };
    event(run, 'simulation', `${mode} : challenge 402 puis règlement simulé.`);
    if (scenario !== 'baseline') event(run, 'simulation', `${mode} : ${scenario === 'concurrent' ? 'deux requêtes simultanées' : 'interruption puis reprise'} simulée.`);
    event(run, 'simulation', `${mode} : ${count} transfert(s) fictif(s), résultat accusé fictivement.`);
    run.reports.push(report);
  }
  return run;
}
