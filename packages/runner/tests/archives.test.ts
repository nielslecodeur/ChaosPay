import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {archiveRuns} from "../src/archives.js";
const fixture=()=>JSON.parse(readFileSync("evidence/public/integration-a.json","utf8"));
test("integration archives preserve scenario pairing and filter private metadata",()=>{
 const data=fixture();data.secret="DO_NOT_EXPORT";data.scenarios[1].after.privatePayload="DO_NOT_EXPORT";
 const runs=archiveRuns(data,"integration-a");
 assert.equal(runs.length,4);
 assert.deepEqual(runs.map(r=>r.scenario),["baseline","drop","crash","confirmation-lost"]);
 assert.ok(runs.every(r=>r.source==="ARCHIVE" && r.reports[0]?.serviceId==="invoice-check"));
 assert.equal(runs[1]!.checkpoints![0]!.purchaseId,runs[1]!.reports[0]!.purchaseId);
 assert.equal(runs[1]!.checkpoints![0]!.verdict,"UNKNOWN");
 assert.ok(!JSON.stringify(runs).includes("DO_NOT_EXPORT"));
});
test("invalid integration metadata or mismatched purchases cannot become archive proof",()=>{
 const data=fixture();data.package="not-a-package";assert.deepEqual(archiveRuns(data,"bad"),[]);
 const mismatch=fixture();mismatch.scenarios[1].before.purchaseId="other";
 assert.throws(()=>archiveRuns(mismatch,"bad"));
});
