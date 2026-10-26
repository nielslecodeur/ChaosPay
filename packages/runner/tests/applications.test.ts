import test from 'node:test';
import assert from 'node:assert/strict';
import { isSupportedApplication } from '../src/applications.js';

test('agent service examples are simulation-only and supported services work on Testnet', () => {
  for (const application of ['market-quote', 'web-research', 'delivery-status', 'weather-brief']) {
    assert.equal(isSupportedApplication(application, 'SIMULATED'), true);
    assert.equal(isSupportedApplication(application, 'TESTNET'), false);
  }
  for (const application of ['csv', 'receipt']) {
    assert.equal(isSupportedApplication(application, 'SIMULATED'), true);
    assert.equal(isSupportedApplication(application, 'TESTNET'), true);
  }
  assert.equal(isSupportedApplication('invoice-check', 'SIMULATED'), false);
  assert.equal(isSupportedApplication('csv', 'ARCHIVE'), false);
});

test('invoice agent is a live-only integrated application',()=>{
 assert.equal(isSupportedApplication('invoice-agent','TESTNET'),true);
 assert.equal(isSupportedApplication('invoice-agent','SIMULATED'),false);
});
