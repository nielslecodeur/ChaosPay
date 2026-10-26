import { event, publicReport, type Run } from './report.js';
import type { Processes } from './processes.js';
import { existsSync } from 'node:fs';

export async function executeInvoiceAgent(run: Run, processes: Processes, recoveryOnly = false, fetcher: typeof fetch = fetch) {
  if (!['baseline', 'drop'].includes(run.scenario)) throw new Error('Unsupported agent scenario');
  if (recoveryOnly && !existsSync(`.local/agent-runs/${run.runId}.sqlite`)) throw new Error('Original journal missing');
  if (!recoveryOnly) {
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:latest';
  event(run, 'setup', `Checking local Ollama model ${model}.`);
  const tagsResponse = await fetcher('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(5000) }).catch(() => {
    event(run, 'error', 'Ollama is unavailable. Start Ollama; no purchase was started.');
    throw new Error('Ollama unavailable');
  });
  if (!tagsResponse.ok) throw new Error('Ollama unavailable');
  const tags = await tagsResponse.json() as { models?: { name: string }[] };
  if (!tags.models?.some(item => item.name === model)) {
    event(run, 'error', 'Required Ollama model is not installed. Configure OLLAMA_MODEL and install it before running.');
    throw new Error('Ollama model missing');
  }
  }
  const env = { FACILITATOR_PORT: '4032', FACILITATOR_URL: 'http://127.0.0.1:4032' };
  await processes.start('facilitator', 'http://127.0.0.1:4032', 'csv', env);
  await processes.start('merchant', 'http://127.0.0.1:3014/paid', 'invoice-agent', env);
  event(run, 'agent', 'Local AI agent started. One purchase maximum, at most 0.01 Testnet XLM.');
  if (!recoveryOnly && run.scenario === 'drop') event(run, 'fault', 'Injected fault: response dropped after settlement and result persistence.');
  const entry = '../../../examples/agent-invoice-demo/lab.mjs';
  const { executeAgent } = await import(entry);
  const outcome = await executeAgent({ id: run.runId, recoveryOnly, fault: run.scenario === 'drop' ? 'drop' : 'none',
    onEvent: (value: { type: string; name?: string; status?: string; reasonCode?: string; text?: string }) => {
      if (value.type === 'tool' && ['purchase_invoice_check', 'recover_purchase'].includes(value.name ?? '')) event(run, 'agent-tool', value.name!);
      if (value.type === 'result') event(run, 'agent-result', `${value.status}: ${value.reasonCode ?? ''}`);
      if (value.type === 'message' && typeof value.text === 'string') event(run, 'agent-message', 'AI explanation (not payment evidence): ' + value.text.slice(0, 4000));
    } });
  const response = await fetch(`http://127.0.0.1:3014/paid/reports/${run.runId}?mode=durable`, { signal: AbortSignal.timeout(20000) });
  if (response.ok) run.reports = [publicReport(await response.json())];
  if (outcome.status !== 'COMPLETED' || run.reports[0]?.verdict !== 'PASS') {
    event(run, 'recovery', 'Agent did not complete a verified purchase. Preserve .local/agent-runs and merchant journals.');
    throw new Error('Agent incomplete');
  }
  event(run, 'complete', 'Agent finished; one expected settlement and acknowledged result verified.');
}
