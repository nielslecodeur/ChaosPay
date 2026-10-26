import { InvoiceClient } from './client.mjs';
import { Asset, Networks } from '@stellar/stellar-sdk';
import { readFileSync } from 'node:fs';
import { runAgent } from './ollama-agent.mjs';
const [command, id, file, fault = 'none'] = process.argv.slice(2);
if (!['purchase','recover','agent'].includes(command) || !id || (command !== 'recover' && !file)) {
  console.log('Usage: npm start -- purchase|agent <id> <invoice.json> [none|drop]\n       npm start -- recover <id>');
  process.exit(1);
}
if (!process.env.MERCHANT_ADDRESS) throw Error('MERCHANT_ADDRESS required');
const client = new InvoiceClient({ database: '.local/agent.sqlite', baseUrl: 'http://127.0.0.1:3004/paid',
  recipient: process.env.MERCHANT_ADDRESS, asset: Asset.native().contractId(Networks.TESTNET) });
try {
  const authorize = async challenge => {
    if (!process.env.BUYER_SECRET) throw Error('BUYER_SECRET required for first purchase');
    const { x402Client } = await import('@x402/core/client');
    const { PaymentRequiredV2Schema } = await import('@x402/core/schemas');
    const { createEd25519Signer } = await import('@x402/stellar');
    const { ExactStellarScheme } = await import('@x402/stellar/exact/client');
    const signing = x402Client.fromConfig({ schemes: [{ network: 'stellar:testnet',
      client: new ExactStellarScheme(createEd25519Signer(process.env.BUYER_SECRET, 'stellar:testnet'), { url: 'https://soroban-testnet.stellar.org' }) }],
      spendControls: { allowedAssets: [{ network: 'stellar:testnet', asset: client.policy.asset, maxAmountPerPayment: client.policy.maxAmount }] } });
    return signing.createPaymentPayload(PaymentRequiredV2Schema.parse(challenge));
  };
  const result = command === 'agent' ? await runAgent({ client, authorize, purchaseId: id,
    invoice: JSON.parse(readFileSync(file, 'utf8')), fault,
    model: process.env.OLLAMA_MODEL, baseUrl: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
    onEvent: event => console.log(JSON.stringify(event)) }) : command === 'recover' ? await client.recover(id)
    : await client.purchase(id, JSON.parse(readFileSync(file, 'utf8')), authorize, { fault });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'COMPLETED' ? 0 : result.status === 'PENDING' ? 2 : 1;
} finally { client.close(); }
