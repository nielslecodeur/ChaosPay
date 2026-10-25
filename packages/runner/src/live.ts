import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { x402Client } from '@x402/core/client';
import { PaymentRequiredV2Schema } from '@x402/core/schemas';
import type { PaymentRequired } from '@x402/core/types';
import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import { config, secret, NETWORK, RPC_URL } from '../../../apps/demo-merchant/src/config.js';
import { digest } from '../../evidence/src/index.js';
import { event, publicReport, type Run } from './report.js';
import { Processes } from './processes.js';
import { RecoveryTimer } from './recovery.js';

export async function execute(run: Run, processes: Processes) {
  const c = config();
  const application = run.application ?? 'csv';
  const merchantUrl = application === 'receipt' ? 'http://127.0.0.1:3003' : c.merchantUrl;
  run.checkpoints = [];
  const request = async (path: string, init?: RequestInit) => {
    event(run, 'http', `${init?.method ?? 'GET'} ${path}`);
    try {
      const r = await fetch(merchantUrl + path, { ...init, signal: AbortSignal.timeout(180000) });
      event(run, 'http', `${path} → HTTP ${r.status}`);
      return r;
    } catch {
      event(run, 'interruption', `${path} → response unavailable; payment must be reconciled.`);
      throw new Error('Request interrupted');
    }
  };
  await processes.start('facilitator', c.facilitatorUrl);
  await processes.start('merchant', merchantUrl, application);
  event(run, 'process', 'Facilitator and merchant ready (local runner processes).');
  for (const mode of run.scenario === 'comparison' ? ['durable', 'naive'] as const : ['durable'] as const) {
    const id = `runner-${randomUUID()}`;
    const recovery = new RecoveryTimer();
    const path = `/purchases/${id}?mode=${mode}`;
    const body = JSON.stringify(application === 'receipt' ? { invoice: { reference: id, amountMinor: '4200', currency: 'EUR' } } : { rows: [{ item: 'demo', amount: 42 }, { item: 'second', amount: 10 }] });
    async function authorize() {
      const r = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (r.status !== 402) throw new Error('Expected payment challenge');
      const challenge = PaymentRequiredV2Schema.parse(await r.json());
      const term = challenge.accepts[0];
      if (challenge.accepts.length !== 1 || !term || term.network !== NETWORK || term.asset !== c.token || term.amount !== c.amount || term.payTo !== c.recipient) throw new Error('Unexpected payment terms');
      const client = x402Client.fromConfig({ schemes: [{ network: NETWORK, client: new ExactStellarScheme(createEd25519Signer(secret('BUYER_SECRET'), NETWORK), { url: RPC_URL }) }], spendControls: { allowedAssets: [{ network: NETWORK, asset: c.token, maxAmountPerPayment: c.amount }] } });
      const payload = await client.createPaymentPayload(challenge as unknown as PaymentRequired);
      mkdirSync('.local', { recursive: true });
      // Save the original request alongside the authorization for manual recovery.
      writeFileSync('.local/request-' + mode + '-' + id + '.json', JSON.stringify({application,merchantUrl,path,body:JSON.parse(body)}), {mode:0o600});
      writeFileSync(`.local/client-${mode}-${id}.json`, JSON.stringify(payload), { mode: 0o600 });
      event(run, 'authorization', `${id}: authorization saved locally before sending.`);
      return Buffer.from(JSON.stringify(payload)).toString('base64');
    }
    let signature = await authorize();
    async function send(fault: string) {
      const headers = { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': signature, 'X-Chaos-Fault': fault };
      const r = await request(path, { method: 'POST', headers, body });
      if (r.status === 202) { recovery.interrupted(); event(run,'unknown','Confirmation unavailable; preserve the original authorization.'); return false; }
      if (r.status !== 200) throw new Error('Unexpected purchase HTTP ' + r.status);
      const result = await r.json() as Record<string, unknown>;
      if (result.result === undefined || digest(result.result) !== result.resultHash) throw new Error('Result integrity mismatch');
      if (fault === 'ack-lost') { recovery.interrupted(); event(run,'interruption','Result received; client acknowledgment deliberately omitted.'); return false; }
      const ack = await request(`/purchases/${id}/ack?mode=${mode}`, { method: 'POST', headers, body: JSON.stringify({ resultHash: result.resultHash }) });
      if (!ack.ok) throw new Error('Acknowledgment failed');
      recovery.acknowledged();
      event(run, 'delivery', `${id}: result integrity verified, acknowledgment received by the merchant.`);
      return true;
    }
    if (run.scenario === 'concurrent') await Promise.all([send('none'), send('none')]);
    else if (run.scenario === 'baseline') await send('none');
    else {
      try { await send(run.scenario === 'comparison' ? 'drop' : run.scenario); } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Request interrupted') throw error;
        recovery.interrupted();
      }
      if (run.scenario === 'crash') {
        await processes.stop('merchant');
        await processes.start('merchant', merchantUrl, application);
        event(run, 'process', 'Merchant restarted; logs preserved.');
      }
      const checkpoint = await request('/reports/' + id + '?mode=' + mode);
      if (!checkpoint.ok) throw new Error('Checkpoint unavailable');
      const before = publicReport(await checkpoint.json());
      if (before.verdict === 'PASS') throw new Error('Premature PASS before recovery');
      run.checkpoints!.push(before);
      event(run,'checkpoint', 'Before recovery: ' + before.verdict);
      if (mode === 'naive') {
        event(run, 'authorization', 'Naive fixture: deliberately creating a second authorization.');
        signature = await authorize();
      }
      let recovered = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        if (await send('none')) { recovered = true; break; }
        await new Promise(resolve => setTimeout(resolve,1000));
      }
      if (!recovered) throw new Error('Recovery deadline exceeded; authorization preserved');
    }
    const response = await request(`/reports/${id}?mode=${mode}`);
    if (!response.ok) throw new Error('Report unavailable');
    const report = publicReport(await response.json());
    run.reports.push({ ...report, recoveryDurationMs: report.responseRecovered ? recovery.durationMs : null });
    event(run, 'evidence', `${id}: observer report received.`);
  }
}
