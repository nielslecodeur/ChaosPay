import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rpc } from "@stellar/stellar-sdk";
import type { PurchaseReport, Transfer } from "../packages/evidence/src/index.js";
import { decodeTransfers } from "../packages/stellar-observer/src/index.js";
import { RPC_URL, PASSPHRASE } from "../packages/recovery/src/testnet-config.js";
import { reportConsistencyError, verifyObservedTransfer } from "../packages/runner/src/evidence-verification.js";

type EvidenceRecord = { run: string; report: PurchaseReport; transfer: Transfer };

function object(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${description} must be an object.`);
  return value as Record<string, unknown>;
}

function campaignRecords(filePath: string): EvidenceRecord[] {
  const root = object(JSON.parse(readFileSync(filePath, "utf8")) as unknown, "Evidence file");
  if (root.simulated !== false || !Array.isArray(root.runs) || root.runs.length === 0) {
    throw new Error(`${filePath}: expected a non-simulated campaign with runs.`);
  }
  const records: EvidenceRecord[] = [];
  for (const [runIndex, rawRun] of root.runs.entries()) {
    const run = object(rawRun, `Run ${runIndex + 1}`);
    const runName = `${String(run.application ?? "unknown")}/${String(run.scenario ?? "unknown")}`;
    if (run.source !== "TESTNET" || run.status !== "COMPLETE") {
      throw new Error(`${runName}: only completed Testnet runs can be verified.`);
    }
    for (const field of ["reports", "checkpoints"] as const) {
      if (field === "checkpoints" && run[field] === undefined) continue;
      if (!Array.isArray(run[field])) throw new Error(`${runName}: ${field} must be an array.`);
      for (const [reportIndex, rawReport] of run[field].entries()) {
        const report = object(rawReport, `${runName} ${field}[${reportIndex}]`) as unknown as PurchaseReport;
        const consistencyError = reportConsistencyError(report);
        if (consistencyError) throw new Error(`${runName} ${field}[${reportIndex}]: ${consistencyError}`);
        for (const transfer of report.transfers) records.push({ run: `${runName}/${field}[${reportIndex}]`, report, transfer });
      }
    }
  }
  return records;
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) files.push("evidence/public/recovery-campaign.json");
  const records = files.flatMap(file => campaignRecords(resolve(process.cwd(), file)));
  if (records.length === 0) throw new Error("No transaction hashes found in the evidence files.");

  const server = new rpc.Server(RPC_URL);
  const network = await server.getNetwork();
  if (network.passphrase !== PASSPHRASE) throw new Error("RPC passphrase mismatch; refusing to verify evidence on the wrong network.");

  const transactions = new Map<string, ReturnType<typeof server.getTransaction>>();
  let pass = 0;
  let fail = 0;
  let unknown = 0;
  for (const record of records) {
    const hash = record.transfer.txHash;
    let result;
    try {
      let request = transactions.get(hash);
      if (!request) {
        request = server.getTransaction(hash);
        transactions.set(hash, request);
      }
      const transaction = await request;
      const events = transaction.status === "SUCCESS"
        ? decodeTransfers(transaction.events.contractEventsXdr.flat(), hash, transaction.ledger)
        : [];
      result = verifyObservedTransfer(
        record.report,
        record.transfer,
        transaction.status,
        transaction.status === "SUCCESS" ? transaction.ledger : null,
        events,
      );
    } catch (error) {
      result = {
        status: "UNKNOWN" as const,
        reason: `RPC or response decoding unavailable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (result.status === "PASS") pass++;
    else if (result.status === "FAIL") fail++;
    else unknown++;
    console.log(`${result.status} ${record.run} ${hash} (ledger ${record.transfer.ledger}): ${result.reason}`);
  }

  console.log(`\nEvidence verification: ${pass} PASS, ${fail} FAIL, ${unknown} UNKNOWN (${records.length} transfer records).`);
  if (fail || unknown) process.exitCode = 1;
}

main().catch(error => {
  console.error(`Evidence verification could not complete: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
