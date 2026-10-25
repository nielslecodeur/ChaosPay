import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { unlinkSync } from 'node:fs';

test('local API loads archives, runs fixtures, exports and rejects cross-origin controls', async () => {
  const base = 'http://127.0.0.1:3002';
  if (await fetch(base + '/api/state').then(() => true, () => false)) throw new Error('Stop runner on port 3002 before integration tests');
  const child = spawn(process.execPath, ['--import', 'tsx', 'packages/runner/src/server.ts'], { stdio: 'ignore', windowsHide: true });
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  const files: string[] = [];
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error('Runner exited');
      ready = await fetch(base + '/api/state').then(r => r.ok, () => false);
      if (ready) break;
      await delay(200);
    }
    assert.ok(ready);
    const state = await fetch(base + '/api/state').then(r => r.json()) as { runs: { source: string }[] };
    assert.ok(state.runs.some(r => r.source === 'ARCHIVE'));
    assert.equal((await fetch(base)).status, 200);
    const headers = { 'Content-Type': 'application/json', 'X-ChaosPay-Local': '1' };
    const body = JSON.stringify({ source: 'SIMULATED', scenario: 'comparison' });
    assert.equal((await fetch(base + '/api/runs', { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body })).status, 403);
    assert.equal((await fetch(base + '/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
    assert.equal((await fetch(base + '/api/runs', { method: 'POST', headers, body: JSON.stringify({ source: 'TESTNET', scenario: 'arbitrary-command' }) })).status, 400);
    const result = await fetch(base + '/api/runs', { method: 'POST', headers, body });
    assert.equal(result.status, 201);
    const run = await result.json() as { runId: string; source: string; reports: { verdict: string }[] };
    files.push(`.local/runner/${run.runId}.json`);
    assert.equal(run.source, 'SIMULATED');
    assert.deepEqual(run.reports.map(r => r.verdict), ['PASS', 'FAIL']);
    const exported = await fetch(base + `/api/runs/${run.runId}/export`);
    assert.match(exported.headers.get('content-disposition')!, /attachment/);
    assert.deepEqual(await exported.json(), run);
    assert.equal((await fetch(base + '/api/runs/missing/export')).status, 404);

    const simulatedAgent = await fetch(base + '/api/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'SIMULATED', scenario: 'baseline', application: 'web-research' }),
    });
    assert.equal(simulatedAgent.status, 201);
    const simulatedAgentRun = await simulatedAgent.json() as { runId: string; application: string; source: string };
    files.push(`.local/runner/${simulatedAgentRun.runId}.json`);
    assert.equal(simulatedAgentRun.application, 'web-research');
    assert.equal(simulatedAgentRun.source, 'SIMULATED');

    const unsupportedTestnet = await fetch(base + '/api/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'TESTNET', scenario: 'baseline', application: 'web-research' }),
    });
    assert.equal(unsupportedTestnet.status, 400);
  } finally {
    child.kill(); await exited;
    for (const file of files) unlinkSync(file);
  }
});
