import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecoveryKit, Store, FaultTriggered, type PaymentGateway, type Fault } from "../packages/recovery/src/index.js";
import { digest } from "../packages/evidence/src/index.js";
function fixture(path = ":memory:") {
  let submissions = 0, visible = true;
  const gateway: PaymentGateway<{ authorization: string }> = {
    verify: async () => ({isValid:true,payer:"buyer"}),
    settle: async () => { submissions++; return {success:true,transaction:"tx"}; },
    receipt: async () => ({transaction:submissions ? "tx" : ""}),
    observe: async (hash,e) => hash && visible
      ? {status:"CONFIRMED",txHash:hash,reason:"test",transfers:[{txHash:hash,ledger:1,...e}]}
      : {status:"UNKNOWN",txHash:hash,reason:"pending",transfers:[]},
  };
  const store = new Store(path);
  const options = {store,gateway,serviceId:"test",tokenContract:"token",recipient:"merchant",amountAtomic:"100000",produce:(input:string)=>({result:input})};
  const request = {purchaseId:"purchase",mode:"durable" as const,payload:{authorization:"original"},input:"hello"};
  return {store,options,request,kit:new RecoveryKit(options), submissions:()=>submissions, visibility:(value:boolean)=>{visible=value;}};
}
for (const fault of ["before-submit","drop","crash","confirmation-lost","ack-lost"] as Fault[]) {
  test(fault + ": recovery preserves one payment, original result and acknowledgment",async()=>{
    const f=fixture();
    try {
      if (["before-submit","drop","crash"].includes(fault)) await assert.rejects(f.kit.execute({...f.request,fault}),FaultTriggered);
      else await f.kit.execute({...f.request,fault});
      const before=await f.kit.report("purchase","durable");
      assert.equal(before.verdict,"UNKNOWN");
      assert.equal(before.responseRecovered,false);
      if(fault==="before-submit") assert.equal(f.submissions(),0);
      const result=await f.kit.execute(f.request);
      assert.equal(result.status,"READY");
      if(result.status!=="READY") throw new Error("Missing result");
      assert.deepEqual(result.result,{result:"hello"});
      f.kit.acknowledge("purchase","durable",f.request.payload,result.resultHash);
      const after=await f.kit.report("purchase","durable");
      assert.equal(after.verdict,"PASS");
      assert.equal(f.submissions(),1);
      assert.ok(after.recoveryMs!==null);
    } finally {f.store.close();}
  });
}
test("unavailable observer never triggers resubmission or premature PASS",async()=>{
  const f=fixture();try {
    f.visibility(false);
    for(let i=0;i<3;i++) assert.equal((await f.kit.execute(f.request)).status,"UNKNOWN");
    assert.equal(f.submissions(),1);
    assert.equal((await f.kit.report("purchase","durable")).verdict,"UNKNOWN");
    f.visibility(true);assert.equal((await f.kit.execute(f.request)).status,"READY");
    assert.equal(f.submissions(),1);
  } finally {f.store.close();}
});
test("two kit instances share a durable submission claim",async()=>{
  const f=fixture();try {
    const other=new RecoveryKit(f.options);
    await Promise.all([f.kit.execute(f.request),other.execute(f.request)]);
    assert.equal(f.submissions(),1);
    await assert.rejects(f.kit.execute({...f.request,input:"changed"}),{status:409});
    await assert.rejects(f.kit.execute({...f.request,payload:{authorization:"replacement"}}),{status:409});
    assert.throws(()=>f.kit.acknowledge("purchase","durable",f.request.payload,"wrong"),{status:409});
  } finally {f.store.close();}
});
test("separate SQLite connections cannot submit one purchase twice",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"chaospay-concurrent-"));
  const path=join(dir,"state.sqlite");
  const secondStore=new Store(path);
  const f=fixture(path);
  try {
    const second=new RecoveryKit({...f.options,store:secondStore});
    const results=await Promise.all([f.kit.execute(f.request),second.execute(f.request)]);
    assert.ok(results.every(result=>result.status==="READY"));
    assert.equal(f.store.get("test:durable:purchase")?.state,"DELIVERY_STORED");
    assert.equal(secondStore.get("test:durable:purchase")?.state,"DELIVERY_STORED");
    assert.equal(f.submissions(),1);
  } finally {
    f.store.close();
    secondStore.close();
    rmSync(dir,{recursive:true,force:true});
  }
});
test("a crash after SUBMITTING remains unknown and is never blindly resubmitted",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"chaospay-claim-crash-"));
  const path=join(dir,"state.sqlite");
  const f=fixture(path);
  try {
    const authDigest=digest(f.request.payload);
    f.store.insert({
      key:"test:durable:purchase",
      purchaseId:f.request.purchaseId,
      mode:f.request.mode,
      bodyHash:digest(f.request.input),
      authDigest,
      buyer:"buyer",
    });
    assert.equal(f.store.claimSubmission("test:durable:purchase"),true);
    f.store.close();

    const reopened=new Store(path);
    try {
      const recovered=new RecoveryKit({...f.options,store:reopened});
      assert.equal((await recovered.execute(f.request)).status,"UNKNOWN");
      assert.equal(f.submissions(),0);
      assert.equal(reopened.get("test:durable:purchase")?.state,"UNKNOWN");
      assert.equal((await recovered.execute(f.request)).status,"UNKNOWN");
      assert.equal(f.submissions(),0);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
});
test("a business side effect can repeat if result persistence fails",async()=>{
  const f=fixture();
  let effects=0;
  let firstCall=true;
  const kit=new RecoveryKit({
    ...f.options,
    produce:()=>{
      effects++;
      if(firstCall) {
        firstCall=false;
        throw new Error("Simulated failure after external effect.");
      }
      return {ok:true};
    },
  });
  try {
    await assert.rejects(kit.execute(f.request),/Simulated failure/);
    const recovered=await kit.execute(f.request);
    assert.equal(recovered.status,"READY");
    assert.equal(effects,2);
    assert.equal(f.submissions(),1);
  } finally {
    f.store.close();
  }
});
test("stored JSON output survives reopening without regenerating result",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"chaospay-kit-"));
  const f=fixture(join(dir,"state.sqlite"));
  try {
    await assert.rejects(f.kit.execute({...f.request,fault:"drop"}),FaultTriggered);
    f.store.close();
    const store=new Store(join(dir,"state.sqlite"));
    try {
      const kit=new RecoveryKit({...f.options,store,produce:()=>{throw new Error("Must reuse stored result");}});
      const result=await kit.execute(f.request);
      assert.equal(result.status,"READY");
      if(result.status==="READY") assert.equal(result.resultHash,digest({result:"hello"}));
      assert.equal(f.submissions(),1);
    } finally {store.close();}
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test("legacy CSV journal migration preserves payload, result and delivery",()=>{
  const store=new Store(":memory:");
  try {
    store.insert({key:"durable:old",purchaseId:"old",mode:"durable",bodyHash:"body",authDigest:"original",buyer:"buyer"});
    store.update("durable:old","DELIVERY_STORED","tx","raw,csv\\n");
    store.delivered("durable:old");
    store.migrateLegacyCsv(); store.migrateLegacyCsv();
    const migrated=store.get("csv:durable:old")!;
    assert.equal(JSON.parse(migrated.result!),"raw,csv\\n");
    assert.equal(migrated.authDigest,"original");assert.equal(migrated.deliveries,1);
    assert.equal(store.claimSubmission(migrated.key),false);
  } finally {store.close();}
});

test("report counts separate naive payments from different payers",async()=>{
  const store=new Store(":memory:");
  const transactions=new Map<string,string>();
  let nextTransaction=0;
  const gateway:PaymentGateway<{buyer:string}> = {
    verify:async payload=>({isValid:true,payer:payload.buyer}),
    settle:async payload=>{
      const transaction="tx-"+(++nextTransaction);
      transactions.set(transaction,payload.buyer);
      return {success:true,transaction};
    },
    receipt:async()=>({}),
    observe:async(txHash,expected)=>({
      status:"CONFIRMED",txHash,reason:"fixture",
      transfers:[{txHash,ledger:1,...expected,from:transactions.get(txHash)!}],
    }),
  };
  const kit=new RecoveryKit({
    store,gateway,serviceId:"test",tokenContract:"token",recipient:"merchant",amountAtomic:"100000",
    produce:async()=>({ok:true}),
  });
  try {
    for(const buyer of ["buyer-one","buyer-two"]){
      const payload={buyer};
      const request={purchaseId:"same-intent",mode:"naive" as const,payload,input:{service:"same"}};
      const result=await kit.execute(request);
      assert.equal(result.status,"READY");
      if(result.status!=="READY") throw new Error("Expected a ready result.");
      kit.acknowledge(request.purchaseId,request.mode,payload,result.resultHash);
    }
    const report=await kit.report("same-intent","naive");
    assert.equal(report.verdict,"FAIL");
    assert.equal(report.settledAmountAtomic,"200000");
    assert.deepEqual(report.observations.map(o=>o.status),["CONFIRMED","CONFIRMED"]);
  } finally {store.close();}
});
