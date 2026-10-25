import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isScenario, scenarios } from '../../../scenarios/index.js';
import { simulate } from './fixture.js';
import { event, type Run } from './report.js';
import { archiveRuns } from './archives.js';
import { Processes } from './processes.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(root);
const app = express();
const port = 3002;
const origin = `http://127.0.0.1:${port}`;
const runs = new Map<string, Run>();
const processes = new Processes();
let busy = false;
// Guard localhost controls against cross-origin requests and DNS rebinding.
app.use((req, res, next) => {
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) { res.sendStatus(403); return; }
  if (req.method !== 'GET' && req.headers['x-chaospay-local'] !== '1') { res.sendStatus(403); return; }
  next();
});
app.use(express.json({ limit: '8kb' }));
function save(run: Run) {
  mkdirSync('.local/runner', { recursive: true });
  writeFileSync(`.local/runner/${run.runId}.json`, JSON.stringify(run, null, 2));
}
// Historical engine evidence is labelled ARCHIVE; no invented execution timeline.
if (existsSync('evidence/public')) for (const name of readdirSync('evidence/public').filter(n => n.endsWith('.json'))) {
  try {
    const data = JSON.parse(readFileSync(resolve('evidence/public', name), 'utf8'));
    for (const run of archiveRuns(data, name.replace(/\.json$/, ''))) {
      event(run, 'archive', 'Historical evidence loaded from the repository; no new network run was performed.');
      runs.set(run.runId, run);
    }
  } catch { /* Ignore unsupported archives. */ }
}
app.get('/api/state', (_req, res) => res.json({ busy, scenarios, runs: [...runs.values()].reverse() }));
app.post('/api/runs', (req, res) => {
  const { scenario, source, application = "csv" } = req.body ?? {};
  if (!["csv","receipt"].includes(application) || !isScenario(scenario) || !['SIMULATED', 'TESTNET'].includes(source)) { res.status(400).json({ error: 'Invalid scenario or source.' }); return; }
  if (busy) { res.status(409).json({ error: 'An experiment is already running.' }); return; }
  if (source === 'SIMULATED') {
    const run = simulate(scenario); run.application = application; runs.set(run.runId, run); save(run); res.status(201).json(run); return;
  }
  if (!existsSync('.env')) { res.status(409).json({ error: 'Configure Testnet with npm run setup:testnet before a live run.' }); return; }
  const run: Run = { runId: randomUUID(), scenario, source, application, status: 'RUNNING', startedAt: new Date().toISOString(), timeline: [], reports: [] };
  busy = true; runs.set(run.runId, run);
  res.status(202).json(run);
  void (async () => {
    try {
      process.loadEnvFile('.env');
      const { execute } = await import('./live.js');
      await execute(run, processes); run.status = 'COMPLETE';
    } catch {
      run.status = 'INTERRUPTED';
      event(run, 'error', 'Execution interrupted. Verdict is unknown without a report. Check configuration and ports; preserve logs and authorizations for recovery.');
    } finally {
      try { await processes.close(); } catch { event(run, 'error', 'A runner process could not be stopped.'); }
      busy = false; save(run);
    }
  })();
});
app.get('/api/runs/:id/export', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) { res.sendStatus(404); return; }
  res.attachment(`chaospay-${run.runId}.json`).json(run);
});
app.use(express.static(resolve(root, 'apps/dashboard')));
const server = app.listen(port, '127.0.0.1', () => console.log(`ChaosPay dashboard: ${origin}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  void processes.close().finally(() => server.close(() => process.exit(0)));
});
