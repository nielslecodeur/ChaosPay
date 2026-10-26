import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Asset, Keypair, Networks, nativeToScVal, StrKey, xdr } from "@stellar/stellar-sdk";
import { Store, Queue } from "../apps/demo-merchant/src/store.js";
import { digest, verdict, type Observation, type PaymentExpectation } from "../packages/evidence/src/index.js";
import { decodeTransfers, observe } from "../packages/stellar-observer/src/index.js";
import { toCsv, validateRows } from "../apps/demo-merchant/src/conversion.js";
const expected: PaymentExpectation = { tokenContract: "token", from: "buyer", to: "merchant", amountAtomic: "100000" };
const confirmed = (hash = "a"): Observation => ({ status: "CONFIRMED", txHash: hash, reason: "fixture", transfers: [{ txHash: hash, ledger: 1, ...expected }] });
const stellarExpected: PaymentExpectation = {
  tokenContract: Asset.native().contractId(Networks.TESTNET),
  from: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey(),
  to: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey(),
  amountAtomic: "100000",
};
function transferEvent(options: {
  tokenContract?: string;
  from?: string;
  to?: string;
  amount?: bigint;
  topic?: string;
  amountAsMap?: boolean;
} = {}) {
  const amount = options.amount ?? 100000n;
  const data = options.amountAsMap
    ? nativeToScVal({ amount })
    : nativeToScVal(amount, { type: "i128" });
  return new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    contractId: StrKey.decodeContract(options.tokenContract ?? stellarExpected.tokenContract) as unknown as xdr.ContractId,
    type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({
      topics: [
        nativeToScVal(options.topic ?? "transfer", { type: "symbol" }),
        nativeToScVal(options.from ?? stellarExpected.from, { type: "address" }),
        nativeToScVal(options.to ?? stellarExpected.to, { type: "address" }),
      ],
      data,
    })),
  });
}
function stellarRpc(events: xdr.ContractEvent[], status = "SUCCESS") {
  return {
    getTransaction: async () => ({
      status,
      ledger: 123,
      events: { contractEventsXdr: [events] },
    }),
  } as unknown as Parameters<typeof observe>[0];
}
test("duplicate observations do not count the same payment twice", () => {
  assert.equal(verdict([confirmed(),confirmed()],expected,true).verdict,"PASS");
});
test("two separately confirmed purchases for one intent fail", () => {
  const result = verdict([confirmed("a"),confirmed("b")],expected,true);
  assert.equal(result.verdict,"FAIL");
  assert.equal(result.settledAmountAtomic,"200000");
});
test("confirmed payments from different payers to one intent are all counted", () => {
  const second = confirmed("b");
  second.transfers[0]!.from = "another-buyer";
  const result = verdict([confirmed("a"),second],expected,true);
  assert.equal(result.verdict,"FAIL");
  assert.equal(result.settledAmountAtomic,"200000");
});
test("missing observer cannot turn into a pass", () => {
  assert.equal(verdict([{ status: "UNKNOWN", txHash: "", transfers: [], reason: "RPC down" }],expected,true).verdict,"UNKNOWN");
  assert.equal(verdict([],expected,true).verdict,"UNKNOWN");
});
test("payment without recovered result is not a successful recovery", () => {
  assert.equal(verdict([confirmed()],expected,false).verdict,"UNKNOWN");
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
test("decodes real XDR for SEP-41 i128 and SAC amount-map transfers", async () => {
  const hash = "b".repeat(64);
  for (const event of [transferEvent(), transferEvent({ amountAsMap: true })]) {
    const parsed = xdr.ContractEvent.fromXDR(event.toXDR("base64"), "base64");
    const transfers = decodeTransfers([parsed], hash, 123);
    assert.deepEqual(transfers, [{
      txHash: hash,
      ledger: 123,
      ...stellarExpected,
    }]);
    assert.equal((await observe(stellarRpc([parsed]), hash, stellarExpected)).status, "CONFIRMED");
  }
});
test("observer rejects transfers with a different contract, payer, recipient, or amount", async () => {
  const hash = "c".repeat(64);
  const wrongContract = Asset.native().contractId(Networks.PUBLIC);
  const wrongPayer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey();
  const wrongRecipient = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 4)).publicKey();
  for (const event of [
    transferEvent({ tokenContract: wrongContract }),
    transferEvent({ from: wrongPayer }),
    transferEvent({ to: wrongRecipient }),
    transferEvent({ amount: 99999n }),
  ]) {
    assert.equal((await observe(stellarRpc([event]), hash, stellarExpected)).status, "FAILED");
  }
});
test("unsupported or missing contract events never confirm a payment", async () => {
  const hash = "d".repeat(64);
  assert.equal((await observe(stellarRpc([transferEvent({ topic: "approve" })]), hash, stellarExpected)).status, "UNSUPPORTED");
  assert.equal((await observe(stellarRpc([]), hash, stellarExpected)).status, "UNSUPPORTED");
  const invalidAmount = transferEvent();
  invalidAmount.body().v0().data(nativeToScVal({ other: 100000n }));
  assert.equal((await observe(stellarRpc([invalidAmount]), hash, stellarExpected)).status, "UNSUPPORTED");
  assert.equal((await observe(stellarRpc([], "FAILED"), hash, stellarExpected)).status, "FAILED");
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
test("CSV formula-like strings are prefixed as text while numeric values remain numeric", () => {
  const csv = toCsv(validateRows([
    { value: "=1+1" },
    { value: "  @SUM(A1:A2)" },
    { value: "\t-HYPERLINK(\"https://example.invalid\")" },
    { value: "+1+1" },
    { value: -2 },
    { value: "ordinary text" },
  ]));
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"'  @SUM/);
  assert.match(csv, /"'\t-HYPERLINK/);
  assert.match(csv, /"'\+1\+1"/);
  assert.match(csv, /"-2"/);
  assert.match(csv, /"ordinary text"/);
});
