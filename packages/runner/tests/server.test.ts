import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('local API loads archives, runs fixtures, exports and rejects cross-origin controls', async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') { probe.close(); reject(new Error('Could not allocate a local test port.')); return; }
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const dataDir = mkdtempSync(join(tmpdir(), 'chaospay-runner-history-'));
  const interruptedId = 'interrupted-before-restart';
  writeFileSync(join(dataDir, `${interruptedId}.json`), JSON.stringify({
    runId: interruptedId,
    scenario: 'baseline',
    source: 'TESTNET',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    timeline: [],
    reports: [],
  }));
  const start = () => spawn(process.execPath, ['--import', 'tsx', 'packages/runner/src/server.ts'], {
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, CHAOSPAY_RUNNER_PORT: String(port), CHAOSPAY_RUNNER_DATA_DIR: dataDir },
  });
  let child = start();
  let exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  const stop = async () => {
    child.kill();
    await exited;
  };
  let simulatedRunId = '';
  try {
    let ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error('Runner exited');
      ready = await fetch(base + '/api/state').then(r => r.ok, () => false);
      if (ready) break;
      await delay(200);
    }
    assert.ok(ready);
    const state = await fetch(base + '/api/state').then(r => r.json()) as { runs: { runId: string; source: string; status: string; timeline: { kind: string }[] }[] };
    assert.ok(state.runs.some(r => r.source === 'ARCHIVE'));
    const interrupted = state.runs.find(r => r.runId === interruptedId);
    assert.equal(interrupted?.status, 'INTERRUPTED');
    assert.ok(interrupted?.timeline.some(entry => entry.kind === 'recovery'));
    assert.equal((await fetch(base)).status, 200);
    const runtime = await fetch(base + '/runtime-config.js');
    assert.equal(runtime.headers.get('cache-control'), 'no-store');
    assert.equal(await runtime.text(), 'globalThis.LUMAID_SERVER = true;');
    const headers = { 'Content-Type': 'application/json', 'X-ChaosPay-Local': '1' };
    const body = JSON.stringify({ source: 'SIMULATED', scenario: 'comparison' });
    assert.equal((await fetch(base + '/api/runs', { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' }, body })).status, 403);
    assert.equal((await fetch(base + '/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status, 403);
    assert.equal((await fetch(base + '/api/runs', { method: 'POST', headers, body: JSON.stringify({ source: 'TESTNET', scenario: 'arbitrary-command' }) })).status, 400);
    const result = await fetch(base + '/api/runs', { method: 'POST', headers, body });
    assert.equal(result.status, 201);
    const run = await result.json() as { runId: string; source: string; reports: { verdict: string }[] };
    simulatedRunId = run.runId;
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
    assert.equal(simulatedAgentRun.application, 'web-research');
    assert.equal(simulatedAgentRun.source, 'SIMULATED');

    const unsupportedTestnet = await fetch(base + '/api/runs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ source: 'TESTNET', scenario: 'baseline', application: 'web-research' }),
    });
    assert.equal(unsupportedTestnet.status, 400);

    await stop();
    child = start();
    exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
    ready = false;
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null) throw new Error('Runner exited during restart');
      ready = await fetch(base + '/api/state').then(r => r.ok, () => false);
      if (ready) break;
      await delay(200);
    }
    assert.ok(ready);
    const restored = await fetch(base + '/api/state').then(r => r.json()) as { runs: { runId: string; source: string; status: string }[] };
    assert.equal(restored.runs.find(r => r.runId === simulatedRunId)?.status, 'COMPLETE');
    assert.equal(restored.runs.find(r => r.runId === interruptedId)?.status, 'INTERRUPTED');
    assert.ok(readdirSync(dataDir).every(name => name.endsWith('.json')));
  } finally {
    await stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
