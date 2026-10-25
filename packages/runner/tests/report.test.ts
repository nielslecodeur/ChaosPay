import test from 'node:test';
import assert from 'node:assert/strict';
import { publicReport } from '../src/report.js';
import { simulate } from '../src/fixture.js';
import { scenarios } from '../../../scenarios/index.js';

test('every fixture remains explicitly simulated, including exports', () => {
  for (const s of scenarios) {
    const run = simulate(s.id);
    assert.equal(run.source, 'SIMULATED');
    assert.ok(run.reports.every(r => r.transfers.every(t => t.txHash.startsWith('SIMULATED-'))));
  }
  assert.deepEqual(simulate('comparison').reports.map(r => [r.mode, r.verdict, r.settledAmountAtomic]), [['durable', 'PASS', '100000'], ['naive', 'FAIL', '200000']]);
});
test('report boundary removes private fields at every level and arbitrary reason text', () => {
  const base = simulate('baseline').reports[0]!;
  const input = { ...base, reason: 'PRIVATE', authorization: 'PRIVATE', observations: [{ payload: 'PRIVATE' }], transfers: base.transfers.map(t => ({ ...t, secret: 'PRIVATE' })) };
  assert.ok(!JSON.stringify(publicReport(input)).includes('PRIVATE'));
});
test('claimed PASS without delivery or exact transfer becomes UNKNOWN', () => {
  const base = simulate('baseline').reports[0]!;
  for (const change of [{ responseRecovered: false }, { transfers: [] }, { settledAmountAtomic: '0' }, { expectedAmountAtomic: '200000' }]) {
    assert.equal(publicReport({ ...base, ...change }).verdict, 'UNKNOWN');
  }
});
test('atomic amounts remain strings, including values beyond JS safe integers', () => {
  const base = simulate('baseline').reports[0]!;
  assert.equal(publicReport({ ...base, verdict: 'UNKNOWN', settledAmountAtomic: '900719925474099300' }).settledAmountAtomic, '900719925474099300');
  assert.throws(() => publicReport({ ...base, settledAmountAtomic: 0.01 }));
  assert.throws(() => publicReport({ ...base, network: 'stellar:mainnet' }));
});
