import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { isScenario, scenarios } from '../../../scenarios/index.js';
import { simulate } from './fixture.js';
import { event, publicReport, type Run } from './report.js';
import { Processes } from './processes.js';
import { isSupportedApplication } from './applications.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(root);
const app = express();
const port = Number(process.env.CHAOSPAY_RUNNER_PORT ?? 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid runner port.');
const origin = `http://127.0.0.1:${port}`;
const runsDirectory = resolve(process.env.CHAOSPAY_RUNNER_DATA_DIR ?? '.local/runner');
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
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(run.runId)) throw new Error('Invalid run ID; refusing to persist runner history.');
  mkdirSync(runsDirectory, { recursive: true });
  const target = resolve(runsDirectory, `${run.runId}.json`);
  const temporary = resolve(runsDirectory, `.${run.runId}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(run, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, target);
  } catch (error) {
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* Preserve the original persistence error. */ }
    throw error;
  }
}
function restoreLocalRuns() {
  if (!existsSync(runsDirectory)) return;
  for (const name of readdirSync(runsDirectory).filter(file => file.endsWith('.json'))) {
    try {
      const value: unknown = JSON.parse(readFileSync(resolve(runsDirectory, name), 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid run record.');
      const raw = value as Partial<Run>;
      if (!raw.runId || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.runId) || name !== `${raw.runId}.json` ||
          typeof raw.scenario !== 'string' || !['SIMULATED', 'TESTNET', 'ARCHIVE'].includes(String(raw.source)) ||
          !['RUNNING', 'COMPLETE', 'INTERRUPTED'].includes(String(raw.status)) || typeof raw.startedAt !== 'string' ||
          (raw.application !== undefined && !['csv', 'receipt'].includes(String(raw.application))) ||
          !Array.isArray(raw.timeline) || !Array.isArray(raw.reports)) throw new Error('Unsupported run record.');
      const timeline = raw.timeline.map(item => {
        if (!item || typeof item !== 'object' || typeof item.at !== 'string' || typeof item.kind !== 'string' || typeof item.message !== 'string')
          throw new Error('Invalid run timeline.');
        return { at: item.at, kind: item.kind, message: item.message };
      });
      const run: Run = {
        runId: raw.runId,
        scenario: raw.scenario,
        source: raw.source as Run['source'],
        status: raw.status === 'RUNNING' ? 'INTERRUPTED' : raw.status!,
        startedAt: raw.startedAt,
        timeline,
        reports: raw.reports.map(publicReport),
        ...(raw.application ? { application: raw.application } : {}),
      };
      if (raw.status === 'RUNNING') event(run, 'recovery', 'Runner redémarré pendant ce run ; le résultat reste interrompu et doit être réconcilié.');
      runs.set(run.runId, run);
      if (raw.status === 'RUNNING') save(run);
    } catch (error) {
      console.error(`Runner history not restored (${name}): ${error instanceof Error ? error.message : 'invalid record'}`);
    }
  }
}
// Historical engine evidence is labelled ARCHIVE; no invented execution timeline.
restoreLocalRuns();
if (existsSync('evidence/public')) for (const name of readdirSync('evidence/public').filter(n => n.endsWith('.json'))) {
  try {
    const data = JSON.parse(readFileSync(resolve('evidence/public', name), 'utf8'));
    if (data.simulated !== false) continue;
    const run: Run = { runId: name.replace(/\.json$/, ''), source: 'ARCHIVE', scenario: 'campagne moteur A', status: 'COMPLETE', startedAt: data.executedAt, timeline: [], reports: Object.values(data.reports).map(publicReport) };
    event(run, 'archive', 'Historical evidence loaded from the repository; no new network run was performed.');
    if (!runs.has(run.runId)) runs.set(run.runId, run);
  } catch (error) {
    console.error(`Archived evidence not loaded (${name}): ${error instanceof Error ? error.message : 'invalid record'}`);
  }
}
app.get('/api/state', (_req, res) => res.json({ busy, scenarios, runs: [...runs.values()].reverse() }));
app.post('/api/runs', (req, res) => {
  const { scenario, source, application = "csv" } = req.body ?? {};
  const validSource = source === 'SIMULATED' || source === 'TESTNET';
  if (!validSource || !isSupportedApplication(application, source) || !isScenario(scenario)) {
    res.status(400).json({ error: 'Invalid scenario or application for this run mode.' }); return;
  }
  if (busy) { res.status(409).json({ error: 'An experiment is already running.' }); return; }
  if (source === 'SIMULATED') {
    const run = simulate(scenario); run.application = application; runs.set(run.runId, run);
    try { save(run); } catch (error) {
      runs.delete(run.runId);
      console.error(`Unable to persist simulated runner run ${run.runId}:`, error);
      res.status(503).json({ error: 'Run was not saved; no experiment result is reported as complete.' });
      return;
    }
    res.status(201).json(run); return;
  }
  if (!existsSync('.env')) { res.status(409).json({ error: 'Configure Testnet with npm run setup:testnet before a live run.' }); return; }
  const run: Run = { runId: randomUUID(), scenario, source, application, status: 'RUNNING', startedAt: new Date().toISOString(), timeline: [], reports: [] };
  busy = true; runs.set(run.runId, run);
  try { save(run); } catch (error) {
    busy = false;
    runs.delete(run.runId);
    console.error(`Unable to persist Testnet runner run ${run.runId}; execution was not started:`, error);
    res.status(503).json({ error: 'Run was not saved; Testnet execution was not started.' });
    return;
  }
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
      try { await processes.close(); } catch (error) {
        event(run, 'error', 'A runner process could not be stopped.');
        console.error(`Unable to stop runner child processes for ${run.runId}:`, error);
      }
      busy = false;
      try { save(run); } catch (error) {
        run.status = 'INTERRUPTED';
        event(run, 'error', 'Final run state could not be persisted; reconcile payment state before retrying.');
        console.error(`Unable to persist final runner state for ${run.runId}:`, error);
      }
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
