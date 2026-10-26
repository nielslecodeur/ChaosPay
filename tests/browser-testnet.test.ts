import test from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '@stellar/stellar-sdk';
// @ts-ignore Browser module intentionally has no Node dependency.
import { createBrowserDemo, JOURNAL_KEY } from '../apps/dashboard/browser-testnet.js';

function fixture() {
  const values = new Map();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  const calls: string[] = [];
  let envelope = '', unavailable = false, submissionTimeout = false, wrongPayment = false;
  const fetcher = async (url: string, init: RequestInit) => {
    calls.push(`${init.method ?? 'GET'} ${url}`);
    if (url.endsWith('/transactions')) {
      assert.ok(storage.getItem(JOURNAL_KEY), 'journal must exist before submission');
      envelope = new URLSearchParams(String(init.body)).get('tx')!;
      if (submissionTimeout) throw new Error('Submission timed out');
    }
    if (url.includes('/transactions/')) {
      if (unavailable) return { ok: false, status: 404 };
      return { ok: true, json: async () => ({ envelope_xdr: envelope, successful: !wrongPayment, hash: JSON.parse(storage.getItem(JOURNAL_KEY)).hash, ledger: 123 }) };
    }
    return { ok: true, json: async () => ({ sequence: '100' }) };
  };
  return { storage, calls, engine: () => createBrowserDemo({ sdk, storage, fetcher }), failConfirmation: () => { unavailable = true; }, restore: () => { unavailable = false; }, timeout: () => { submissionTimeout = true; }, mismatch: () => { wrongPayment = true; } };
}
test('lost response survives reload, recovers a real-format signed envelope without a second submission', async () => {
  const f = fixture();
  const saved = await f.engine().start('drop');
  assert.equal(saved.status, 'RESPONSE_LOST');
  assert.equal((await f.engine().recover()).status, 'RECOVERED');
  await f.engine().recover();
  assert.equal(f.calls.filter(c => c.startsWith('POST ')).length, 1);
  assert.equal(f.calls.filter(c => c.includes('friendbot')).length, 2);
  assert.equal(Object.hasOwn(f.engine().read(), 'secret'), false);
  await assert.rejects(() => f.engine().start('baseline'), /already saved/);
});
test('normal purchase returns a verified receipt', async () => {
  const f = fixture();
  const result = await f.engine().start('baseline');
  assert.equal(result.result.arithmeticValid, true);
  assert.equal(result.ledger, 123);
});
test('submission timeout and inaccessible confirmation preserve UNKNOWN and never pay again', async () => {
  const f = fixture(); f.timeout();
  await assert.rejects(() => f.engine().start('drop'), /timed out/);
  f.failConfirmation();
  await assert.rejects(() => f.engine().recover(), /404/);
  assert.equal(f.engine().read().status, 'UNKNOWN');
  f.restore();
  assert.equal((await f.engine().recover()).status, 'RECOVERED');
  assert.equal(f.calls.filter(c => c.startsWith('POST ')).length, 1);
});
test('failed ledger transaction cannot produce a receipt', async () => {
  const f = fixture(); await f.engine().start('drop'); f.mismatch();
  await assert.rejects(() => f.engine().recover(), /does not confirm/);
  assert.equal(f.engine().read().result, undefined);
});
test('blocked storage prevents all network activity', async () => {
  const f = fixture(); f.storage.setItem = () => { throw new Error('Quota exceeded'); };
  await assert.rejects(() => f.engine().start('drop'), /Quota/);
  assert.equal(f.calls.length, 0);
});
