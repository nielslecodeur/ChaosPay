import type { PurchaseReport, Transfer } from "../../evidence/src/index.js";

export type VerificationResult = { status: "PASS" | "FAIL" | "UNKNOWN"; reason: string };

export function reportConsistencyError(report: PurchaseReport): string | null {
  if (report.network !== "stellar:testnet") return "Report is not for Stellar Testnet.";
  if (!/^\d+$/.test(report.expectedAmountAtomic) || !/^\d+$/.test(report.settledAmountAtomic)) return "Invalid atomic amount.";
  if (report.transfers.some(transfer =>
    !/^[a-f0-9]{64}$/i.test(transfer.txHash) ||
    transfer.tokenContract !== report.tokenContract ||
    transfer.amountAtomic !== report.expectedAmountAtomic ||
    !/^\d+$/.test(transfer.amountAtomic) ||
    !Number.isSafeInteger(transfer.ledger) ||
    transfer.ledger < 0 ||
    !transfer.from ||
    !transfer.to
  )) return "A transfer does not match the report's expected asset, amount, or metadata.";

  const total = report.transfers.reduce((sum, transfer) => sum + BigInt(transfer.amountAtomic), 0n);
  if (total.toString() !== report.settledAmountAtomic) return "Settled amount does not equal the sum of reported transfers.";

  if (report.verdict === "PASS" &&
      (!report.responseRecovered || report.transfers.length !== 1 || total !== BigInt(report.expectedAmountAtomic))) {
    return "PASS requires a recovered response and exactly one payment for the expected amount.";
  }
  if (report.verdict === "FAIL" && total <= BigInt(report.expectedAmountAtomic)) {
    return "This campaign reports FAIL only when confirmed transfers exceed the expected amount.";
  }
  return null;
}

export function verifyObservedTransfer(
  report: PurchaseReport,
  transfer: Transfer,
  transactionStatus: string,
  transactionLedger: number | null,
  observedTransfers: Transfer[],
): VerificationResult {
  if (transactionStatus === "NOT_FOUND") {
    return { status: "UNKNOWN", reason: "Transaction not found by this RPC; absence does not prove failure." };
  }
  if (transactionStatus === "FAILED") {
    return { status: "FAIL", reason: "The Testnet ledger records this transaction as failed." };
  }
  if (transactionStatus !== "SUCCESS") {
    return { status: "UNKNOWN", reason: "The RPC did not return a confirmed transaction status." };
  }
  if (transactionLedger !== transfer.ledger) {
    return { status: "FAIL", reason: "Transaction ledger does not match the evidence report." };
  }
  if (transfer.tokenContract !== report.tokenContract || transfer.amountAtomic !== report.expectedAmountAtomic) {
    return { status: "FAIL", reason: "Reported transfer does not match the report's expected asset and amount." };
  }
  const matchingEvent = observedTransfers.some(event =>
    event.txHash.toLowerCase() === transfer.txHash.toLowerCase() &&
    event.ledger === transfer.ledger &&
    event.tokenContract === transfer.tokenContract &&
    event.from === transfer.from &&
    event.to === transfer.to &&
    event.amountAtomic === transfer.amountAtomic
  );
  if (!matchingEvent) {
    return { status: "FAIL", reason: "No matching on-chain contract transfer event was found." };
  }
  return { status: "PASS", reason: "Confirmed Testnet transaction and exact contract transfer match the evidence." };
}
