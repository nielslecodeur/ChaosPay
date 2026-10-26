import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { InvoiceClient } from './client.mjs';
const body = { invoice: { reference: 'DEMO' } };
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agent-test-'));
  let signs = 0, payments = 0, lost = true, journal = true, tampered = false, ack = false;
  const signatures = [], result = { totalsMatch: false }, tx = 'a'.repeat(64);
  const resultHash = createHash('sha256').update(JSON.stringify(result)).digest('hex');
  const terms = { scheme: 'exact', network: 'stellar:testnet', asset: 'token', payTo: 'merchant', amount: '100000' };
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status });
  const options = { database: join(dir, 'client.sqlite'), baseUrl: 'http://127.0.0.1:3004/paid', recipient: 'merchant', asset: 'token',
    fetcher: async (url, init) => {
      if (url.includes('/reports/')) return journal ? json({ schemaVersion: 1, purchaseId: 'one', mode: 'durable', network: 'stellar:testnet',
        tokenContract: 'token', expectedAmountAtomic: '100000', settledAmountAtomic: '100000', responseRecovered: ack, verdict: ack ? 'PASS' : 'UNKNOWN',
        transfers: [{ txHash: tx, from: 'buyer', to: 'merchant', tokenContract: 'token', amountAtomic: '100000', ledger: 1 }] }) : json({},404);
      if (url.includes('/ack?')) { ack = true; return json({ acknowledged: true }); }
      if (!init.headers['PAYMENT-SIGNATURE']) return json({ x402Version: 2, resource: { url }, accepts: [terms] },402);
      signatures.push(init.headers['PAYMENT-SIGNATURE']);
      if (!payments) payments++;
      if (lost) { lost = false; throw Error('response lost'); }
      return json({ result, resultHash: tampered ? 'bad' : resultHash, txHash: tx });
    } };
  const authorize = async c => { signs++; return { x402Version: 2, resource: c.resource, accepted: c.accepts[0], payload: { signature: 'original' } }; };
  return { options, authorize, counts: () => ({ signs,payments,ack }), signatures,
    loseJournal: () => { journal = false; }, corrupt: () => { tampered = true; }, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
test('lost response survives restart and recovery never signs again', async () => {
  const f = fixture(); let c = new InvoiceClient(f.options);
  try {
    assert.equal((await c.purchase('one', body, f.authorize)).status, 'PENDING');
    c.close(); c = new InvoiceClient(f.options);
    assert.equal((await c.recover('one')).status, 'COMPLETED');
    assert.equal((await c.recover('one')).status, 'COMPLETED');
    assert.deepEqual(f.counts(), { signs:1,payments:1,ack:true });
    assert.equal(new Set(f.signatures).size,1);
    await assert.rejects(c.purchase('two', body, f.authorize), /budget/);
  } finally { c.close(); f.cleanup(); }
});
test('missing merchant journal blocks any signed resend', async () => {
  const f = fixture(), c = new InvoiceClient(f.options);
  try {
    await c.purchase('one', body, f.authorize); f.loseJournal();
    assert.equal((await c.recover('one')).reasonCode, 'MERCHANT_JOURNAL_MISSING');
    assert.equal(f.signatures.length,1);
  } finally { c.close(); f.cleanup(); }
});
test('corrupted result is never acknowledged', async () => {
  const f = fixture(), c = new InvoiceClient(f.options);
  try {
    await c.purchase('one', body, f.authorize); f.corrupt();
    assert.equal((await c.recover('one')).reasonCode, 'RESULT_INTEGRITY');
    assert.equal(f.counts().ack,false);
  } finally { c.close(); f.cleanup(); }
});
test('two connections cannot authorize the same intent twice', async () => {
  const f = fixture(), a = new InvoiceClient(f.options), b = new InvoiceClient(f.options);
  try {
    await Promise.all([a.purchase('one',body,f.authorize),b.purchase('one',body,f.authorize)]);
    assert.equal(f.counts().signs,1);
    assert.equal((await b.purchase('one',{ invoice: { reference:'different' } },f.authorize)).reasonCode,'INTENT_MISMATCH');
  } finally { a.close(); b.close(); f.cleanup(); }
});
