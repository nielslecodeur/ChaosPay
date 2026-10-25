import test from 'node:test';
import assert from 'node:assert/strict';
import { RecoveryTimer } from '../src/recovery.js';

test('recovery includes restart and retries until the first acknowledged delivery', () => {
  let now = 100;
  const timer = new RecoveryTimer(() => now);
  timer.interrupted();
  now = 500; timer.interrupted();
  now = 1750; timer.acknowledged();
  now = 2000; timer.acknowledged();
  assert.equal(timer.durationMs, 1650);
});
test('normal delivery and incomplete recovery do not invent a recovery duration', () => {
  const timer = new RecoveryTimer(() => 100);
  timer.acknowledged(); assert.equal(timer.durationMs, null);
  timer.interrupted(); assert.equal(timer.durationMs, null);
});
