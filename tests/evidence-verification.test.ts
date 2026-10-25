import test from "node:test";
import assert from "node:assert/strict";
import type { PurchaseReport, Transfer } from "../packages/evidence/src/index.js";
import { reportConsistencyError, verifyObservedTransfer } from "../packages/runner/src/evidence-verification.js";

const transfer: Transfer = {
  txHash: "a".repeat(64),
  tokenContract: "token",
  from: "buyer",
  to: "merchant",
  amountAtomic: "100000",
  ledger: 42,
};
const report: PurchaseReport = {
  schemaVersion: 1,
  purchaseId: "purchase",
  mode: "durable",
  network: "stellar:testnet",
  tokenContract: "token",
  expectedAmountAtomic: "100000",
  settledAmountAtomic: "100000",
  transfers: [transfer],
  responseRecovered: true,
  verdict: "PASS",
  reason: "verified",
};

test("independent verification requires a successful transaction, matching ledger, and exact transfer event", () => {
  assert.equal(verifyObservedTransfer(report, transfer, "SUCCESS", 42, [transfer]).status, "PASS");
  assert.equal(verifyObservedTransfer(report, transfer, "SUCCESS", 43, [transfer]).status, "FAIL");
  assert.equal(verifyObservedTransfer(report, transfer, "SUCCESS", 42, []).status, "FAIL");
});

test("missing RPC transaction remains UNKNOWN rather than becoming a payment failure", () => {
  assert.equal(verifyObservedTransfer(report, transfer, "NOT_FOUND", null, []).status, "UNKNOWN");
});

test("PASS requires one expected transfer and a recovered response", () => {
  assert.equal(reportConsistencyError(report), null);
  assert.match(reportConsistencyError({ ...report, responseRecovered: false }) ?? "", /PASS requires/);
  assert.match(reportConsistencyError({ ...report, transfers: [transfer, transfer], settledAmountAtomic: "200000" }) ?? "", /PASS requires/);
});

test("overpayment report must reconcile to transfer amounts", () => {
  const second = { ...transfer, txHash: "b".repeat(64), ledger: 43 };
  const overpaid: PurchaseReport = {
    ...report,
    mode: "naive",
    verdict: "FAIL",
    settledAmountAtomic: "200000",
    transfers: [transfer, second],
  };
  assert.equal(reportConsistencyError(overpaid), null);
  assert.match(reportConsistencyError({ ...overpaid, settledAmountAtomic: "100000" }) ?? "", /sum of reported transfers/);
});
