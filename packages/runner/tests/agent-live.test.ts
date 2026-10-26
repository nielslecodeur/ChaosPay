import test from 'node:test';
import assert from 'node:assert/strict';
import { executeInvoiceAgent } from '../src/agent-live.js';
import { Processes } from '../src/processes.js';
import type { Run } from '../src/report.js';
for (const missing of ['server', 'model']) test(`agent preflight ${missing}: no service or payment starts`, async () => {
  const run: Run = { runId:'preflight',application:'invoice-agent',scenario:'drop',source:'TESTNET',status:'RUNNING',startedAt:new Date().toISOString(),timeline:[],reports:[] };
  const processes = new Processes(); let starts = 0;
  processes.start = async () => { starts++; };
  const fetcher: typeof fetch = async () => { if (missing === 'server') throw Error('offline'); return Response.json({models:[]}); };
  await assert.rejects(executeInvoiceAgent(run,processes,false,fetcher));
  assert.equal(starts,0);
  assert.ok(run.timeline.some(item=>item.kind==='error'));
});
