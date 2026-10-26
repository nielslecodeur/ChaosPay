import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { executeInvoiceAgent } from '../packages/runner/src/agent-live.js';
import { Processes } from '../packages/runner/src/processes.js';
import { event, type Run } from '../packages/runner/src/report.js';
const id = process.argv[2];
if (!id || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Usage: npm run recover:agent -- <runId>');
if (!existsSync(`.local/agent-runs/${id}.sqlite`)) throw new Error('Original journal missing; refusing to create a purchase');
const path = `.local/runner/${id}.json`;
const run: Run = JSON.parse(readFileSync(path, 'utf8'));
if (run.runId !== id || run.application !== 'invoice-agent' || run.source !== 'TESTNET') throw new Error('Not a saved invoice agent run');
const processes = new Processes();
try {
  event(run, 'recovery', 'Explicit recovery of the same purchase; no model and no new signing.');
  await executeInvoiceAgent(run, processes, true);
  run.status = 'COMPLETE';
} catch {
  run.status = 'INTERRUPTED'; process.exitCode = 2;
  event(run, 'error', 'Recovery incomplete. Preserve journals; check ports 3014/4032 and connectivity.');
} finally {
  await processes.close();
  writeFileSync(path + '.tmp', JSON.stringify(run, null, 2), { mode: 0o600 });
  renameSync(path + '.tmp', path);
  console.log(JSON.stringify({ runId:id, status:run.status, reports:run.reports }, null, 2));
}
