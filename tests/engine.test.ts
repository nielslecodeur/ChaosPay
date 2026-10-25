import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, Queue } from "../apps/demo-merchant/src/store.js";
import { digest, verdict, type Observation, type PaymentExpectation } from "../packages/evidence/src/index.js";
import { observe } from "../packages/stellar-observer/src/index.js";
import { toCsv, validateRows } from "../apps/demo-merchant/src/conversion.js";
const expected: PaymentExpectation = { tokenContract: "token", from: "buyer", to: "merchant", amountAtomic: "100000" };
const confirmed = (hash = "a"): Observation => ({ status: "CONFIRMED", txHash: hash, reason: "fixture", transfers: [{ txHash: hash, ledger: 1, ...expected }] });
test("duplicate observations do not count the same payment twice", () => {
  assert.equal(verdict([confirmed(),confirmed()],expected,true).verdict,"PASS");
});
test("two separately confirmed purchases for one intent fail", () => {
  const result = verdict([confirmed("a"),confirmed("b")],expected,true);
  assert.equal(result.verdict,"FAIL");
  assert.equal(result.settledAmountAtomic,"200000");
});
test("missing observer cannot turn into a pass", () => {
  assert.equal(verdict([{ status: "UNKNOWN", txHash: "", transfers: [], reason: "RPC down" }],expected,true).verdict,"UNKNOWN");
  assert.equal(verdict([],expected,true).verdict,"UNKNOWN");
});
test("payment without recovered result is not a successful recovery", () => {
  assert.equal(verdict([confirmed()],expected,false).verdict,"FAIL");
});
test("wrong amount and wrong recipient cannot pass", () => {
  const o = confirmed(); o.transfers[0]!.amountAtomic = "99999";
  assert.equal(verdict([o],expected,true).verdict,"FAIL");
  o.transfers[0]!.to = "other";
  assert.equal(verdict([o],expected,true).verdict,"FAIL");
});
test("RPC errors and NOT_FOUND remain unknown", async () => {
  const hash = "a".repeat(64);
  const down = { getTransaction: async () => { throw new Error("offline"); } };
  assert.equal((await observe(down,hash,expected)).status,"UNKNOWN");
  const missing = { getTransaction: async () => ({ status: "NOT_FOUND" }) } as unknown as Parameters<typeof observe>[0];
  assert.equal((await observe(missing,hash,expected)).status,"UNKNOWN");
});
test("purchase and result survive reopening SQLite; duplicate purchase is rejected", () => {
  const dir = mkdtempSync(join(tmpdir(),"chaospay-test-"));
  try {
    let store = new Store(join(dir,"state.sqlite"));
    const p = { key: "durable:one", purchaseId: "one", mode: "durable" as const, bodyHash: digest({a:1}), authDigest: "original", buyer: "buyer" };
    store.insert(p);
    assert.throws(() => store.insert({...p,authDigest:"different"}));
    store.update(p.key,"DELIVERY_STORED","a".repeat(64),"saved csv");
    store.close();
    store = new Store(join(dir,"state.sqlite"));
    assert.equal(store.get(p.key)?.result,"saved csv");
    assert.equal(store.get(p.key)?.authDigest,"original");
    store.close();
  } finally { rmSync(dir,{ recursive: true, force: true }); }
});
test("queue serializes simultaneous work and recovers after failure", async () => {
  const q = new Queue(); const steps: number[] = [];
  const first = q.run(async () => { steps.push(1); await Promise.resolve(); steps.push(2); throw new Error("expected"); });
  const second = q.run(async () => { steps.push(3); return 42; });
  await assert.rejects(first);
  assert.equal(await second,42);
  assert.deepEqual(steps,[1,2,3]);
});
test("conversion is deterministic and rejects nested data before payment", () => {
  assert.throws(() => validateRows([{ a: {} }]));
  assert.throws(() => validateRows([]));
  assert.equal(toCsv(validateRows([{b:'a"b',a:1}])), '"a","b"\n"1","a""b"\n');
});
