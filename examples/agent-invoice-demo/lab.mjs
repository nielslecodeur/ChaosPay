import { InvoiceClient } from './client.mjs';
import { runAgent } from './ollama-agent.mjs';
import { Asset, Networks } from '@stellar/stellar-sdk';
import { x402Client } from '@x402/core/client';
import { PaymentRequiredV2Schema } from '@x402/core/schemas';
import { createEd25519Signer } from '@x402/stellar';
import { ExactStellarScheme } from '@x402/stellar/exact/client';
import { readFileSync } from 'node:fs';

export async function executeAgent({ id, fault, onEvent, recoveryOnly = false }) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw Error('Invalid purchase ID');
  const asset = Asset.native().contractId(Networks.TESTNET);
  const client = new InvoiceClient({ database: `.local/agent-runs/${id}.sqlite`, baseUrl: 'http://127.0.0.1:3014/paid',
    recipient: process.env.MERCHANT_ADDRESS, asset });
  try {
    if (recoveryOnly) {
      const result = await client.recover(id);
      onEvent({ type: 'result', status: result.status, reasonCode: result.reasonCode });
      return { status: result.status, result };
    }
    const authorize = async challenge => {
      const signer = x402Client.fromConfig({ schemes: [{ network: 'stellar:testnet', client:
        new ExactStellarScheme(createEd25519Signer(process.env.BUYER_SECRET, 'stellar:testnet'), { url: 'https://soroban-testnet.stellar.org' }) }],
        spendControls: { allowedAssets: [{ network: 'stellar:testnet', asset, maxAmountPerPayment: '100000' }] } });
      return signer.createPaymentPayload(PaymentRequiredV2Schema.parse(challenge));
    };
    return await runAgent({ client, authorize, purchaseId: id, fault,
      invoice: JSON.parse(readFileSync(new URL('./invoice.json', import.meta.url), 'utf8')),
      model: process.env.OLLAMA_MODEL || 'qwen2.5:latest', baseUrl: 'http://127.0.0.1:11434', onEvent });
  } finally { client.close(); }
}
