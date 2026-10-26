import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from './ollama-agent.mjs';

test('tool loop purchases, recovers and forwards only allowed results', async () => {
  const sent = []; let n = 0, purchases = 0, recoveries = 0;
  const result = await runAgent({
    model: 'test', purchaseId: 'one', invoice: { invoice: {} }, authorize: () => {},
    client: {
      purchase: async () => { purchases++; return { status: 'PENDING', reasonCode: 'INTERRUPTED', payload: 'SECRET' }; },
      recover: async () => {
        recoveries++;
        return { status: 'COMPLETED', result: { totalsMatch: false }, payload: 'SECRET', evidence: { network: 'stellar:testnet', transfers: [] } };
      },
    },
    fetcher: async (_url, init) => {
      sent.push(init.body);
      n++;
      if (n < 3) {
        return Response.json({
          message: {
            role: 'assistant', content: '',
            tool_calls: [{ function: { name: n === 1 ? 'purchase_invoice_check' : 'recover_purchase', arguments: {} } }],
          },
        });
      }
      return Response.json({ message: { role: 'assistant', content: 'Résultat récupéré.' } });
    },
  });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(purchases, 1);
  assert.equal(recoveries, 1);
  assert.ok(sent.every(s => !s.includes('SECRET')));
  assert.ok(sent[1].includes('"role":"tool"'));
});

test('model cannot supply a destination or bypass BLOCKED', async () => {
  let calls = 0, n = 0;
  await runAgent({
    model: 'test', purchaseId: 'one', invoice: {}, authorize: () => {}, maxTurns: 2,
    client: { purchase: async () => { calls++; } },
    fetcher: async () => Response.json({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{
          function: {
            name: 'purchase_invoice_check',
            arguments: ++n === 1 ? { url: 'https://evil.example' } : {},
          },
        }],
      },
    }),
  });
  assert.equal(calls, 0);
});

test('harmless invoice args from the model are ignored', async () => {
  let purchases = 0;
  const result = await runAgent({
    model: 'test', purchaseId: 'one', invoice: { invoice: { reference: 'LOCAL' } }, authorize: () => {},
    client: {
      purchase: async (_id, body) => {
        purchases++;
        assert.equal(body.invoice.reference, 'LOCAL');
        return { status: 'COMPLETED', result: { totalsMatch: false }, evidence: { network: 'stellar:testnet', transfers: [] } };
      },
    },
    fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.messages.some(m => m.role === 'tool')) {
        return Response.json({ message: { role: 'assistant', content: 'ok' } });
      }
      return Response.json({
        message: {
          role: 'assistant', content: '',
          tool_calls: [{ function: { name: 'purchase_invoice_check', arguments: { invoice: { reference: 'MODEL' } } } }],
        },
      });
    },
  });
  assert.equal(purchases, 1);
  assert.equal(result.status, 'COMPLETED');
});
