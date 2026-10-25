import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { Run } from './src/report.js';

// Exercise exactly the API used by the dashboard; the runner owns payment and process control.
const base = 'http://127.0.0.1:3002';
const runs: Run[] = [];
for (const scenario of ['baseline', 'drop', 'crash', 'concurrent', 'comparison']) {
  const response = await fetch(base + '/api/runs', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ChaosPay-Local': '1' },
    body: JSON.stringify({ source: 'TESTNET', scenario }),
  });
  assert.equal(response.status, 202, await response.clone().text());
  const started = await response.json() as Run;
  console.log(`${scenario}: started ${started.runId}`);
  const deadline = Date.now() + 600000;
  let finished: Run | undefined;
  while (Date.now() < deadline) {
    const state = await fetch(base + '/api/state').then(r => r.json()) as { busy: boolean; runs: Run[] };
    const run = state.runs.find(r => r.runId === started.runId);
    if (run && run.status !== 'RUNNING' && !state.busy) { finished = run; break; }
    await delay(1000);
  }
  assert.ok(finished, 'Runner deadline exceeded; inspect dashboard and preserve authorization');
  assert.equal(finished.status, 'COMPLETE', JSON.stringify(finished.timeline));
  assert.equal(finished.reports.length, scenario === 'comparison' ? 2 : 1);
  for (const report of finished.reports) {
    const naive = report.mode === 'naive';
    assert.equal(report.verdict, naive ? 'FAIL' : 'PASS');
    assert.equal(report.responseRecovered, true);
    assert.equal(new Set(report.transfers.map(t => t.txHash)).size, naive ? 2 : 1);
    assert.equal(BigInt(report.settledAmountAtomic), BigInt(report.expectedAmountAtomic) * (naive ? 2n : 1n));
    if (['drop', 'crash', 'comparison'].includes(scenario)) assert.ok(typeof report.recoveryDurationMs === 'number' && report.recoveryDurationMs >= 0);
  }
  const exported = await fetch(base + `/api/runs/${finished.runId}/export`).then(r => r.json());
  assert.deepEqual(exported, finished);
  runs.push(finished);
  console.log(`${scenario}: verified ${finished.reports.map(r => `${r.mode}=${r.verdict}, paid=${r.settledAmountAtomic}, recoveryMs=${r.recoveryDurationMs}`).join('; ')}`);
}
mkdirSync('.local/runner', { recursive: true });
const file = `.local/runner/validation-${Date.now()}.json`;
writeFileSync(file, JSON.stringify({ verifiedAt: new Date().toISOString(), simulated: false, runs }, null, 2));
console.log(`All five scenarios verified. Evidence: ${file}`);
