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

export async function execute(run: Run, processes: Processes) {
  const c = config();
  const request = async (path: string, init?: RequestInit) => {
    event(run, 'http', `${init?.method ?? 'GET'} ${path}`);
    try {
      const r = await fetch(c.merchantUrl + path, { ...init, signal: AbortSignal.timeout(180000) });
      event(run, 'http', `${path} → HTTP ${r.status}`);
      return r;
    } catch {
      event(run, 'interruption', `${path} → réponse indisponible ; paiement à réconcilier.`);
      throw new Error('Request interrupted');
    }
  };
  await processes.start('facilitator', c.facilitatorUrl);
  await processes.start('merchant', c.merchantUrl);
  event(run, 'process', 'Facilitator et marchand prêts (processus locaux du runner).');
  for (const mode of run.scenario === 'comparison' ? ['durable', 'naive'] as const : ['durable'] as const) {
    const id = `runner-${randomUUID()}`;
    const path = `/purchases/${id}?mode=${mode}`;
    const body = JSON.stringify({ rows: [{ item: 'demo', amount: 42 }, { item: 'second', amount: 10 }] });
    async function authorize() {
      const r = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (r.status !== 402) throw new Error('Expected payment challenge');
      const challenge = PaymentRequiredV2Schema.parse(await r.json());
      const term = challenge.accepts[0];
      if (challenge.accepts.length !== 1 || !term || term.network !== NETWORK || term.asset !== c.token || term.amount !== c.amount || term.payTo !== c.recipient) throw new Error('Unexpected payment terms');
      const client = x402Client.fromConfig({ schemes: [{ network: NETWORK, client: new ExactStellarScheme(createEd25519Signer(secret('BUYER_SECRET'), NETWORK), { url: RPC_URL }) }], spendControls: { allowedAssets: [{ network: NETWORK, asset: c.token, maxAmountPerPayment: c.amount }] } });
      const payload = await client.createPaymentPayload(challenge as unknown as PaymentRequired);
      mkdirSync('.local', { recursive: true });
      // Same location and body as the reference CLI: recovery remains possible after a runner crash.
      writeFileSync(`.local/client-${mode}-${id}.json`, JSON.stringify(payload), { mode: 0o600 });
      event(run, 'authorization', `${id} : autorisation sauvegardée localement avant envoi.`);
      return Buffer.from(JSON.stringify(payload)).toString('base64');
    }
    let signature = await authorize();
    async function send(fault: string) {
      const headers = { 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': signature, 'X-Chaos-Fault': fault };
      const r = await request(path, { method: 'POST', headers, body });
      if (r.status !== 200) return;
      const result = await r.json() as Record<string, unknown>;
      if (typeof result.csv !== 'string' || digest(result.csv) !== result.csvHash) throw new Error('CSV integrity mismatch');
      const ack = await request(`/purchases/${id}/ack?mode=${mode}`, { method: 'POST', headers, body: JSON.stringify({ csvHash: result.csvHash }) });
      if (!ack.ok) throw new Error('Acknowledgment failed');
      event(run, 'delivery', `${id} : intégrité du CSV vérifiée, accusé reçu par le marchand.`);
    }
    if (run.scenario === 'concurrent') await Promise.all([send('none'), send('none')]);
    else if (run.scenario === 'baseline') await send('none');
    else {
      try { await send(run.scenario === 'crash' ? 'crash' : 'drop'); } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Request interrupted') throw error;
      }
      if (run.scenario === 'crash') {
        await processes.stop('merchant');
        await processes.start('merchant', c.merchantUrl);
        event(run, 'process', 'Marchand redémarré ; journaux conservés.');
      }
      if (mode === 'naive') {
        event(run, 'authorization', 'Fixture naïve : création volontaire d’une seconde autorisation.');
        signature = await authorize();
      }
      await send('none');
    }
    const response = await request(`/reports/${id}?mode=${mode}`);
    if (!response.ok) throw new Error('Report unavailable');
    run.reports.push(publicReport(await response.json()));
    event(run, 'evidence', `${id} : rapport de l’observateur reçu.`);
  }
}
