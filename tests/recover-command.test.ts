import test from "node:test";
import assert from "node:assert/strict";
import {Asset,Networks} from "@stellar/stellar-sdk";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {validateSaved,loadSaved,recoverPurchase} from "../scripts/lib/recover.js";
import {digest} from "../packages/evidence/src/index.js";
const asset=Asset.native().contractId(Networks.TESTNET),url="http://127.0.0.1:3004/paid/purchases/test?mode=durable";
const raw=()=>({url,body:{invoice:"saved"},payload:{x402Version:2,resource:{url,description:"test",mimeType:"application/json"},accepted:{scheme:"exact",network:"stellar:testnet",asset,amount:"100000",payTo:"merchant",maxTimeoutSeconds:120},payload:{original:"signed"}}});
const report=()=>({purchaseId:"test",mode:"durable",network:"stellar:testnet",tokenContract:asset,expectedAmountAtomic:"100000",settledAmountAtomic:"100000",responseRecovered:true,verdict:"PASS",transfers:[{amountAtomic:"100000",tokenContract:asset,to:"merchant"}]});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
test("only a bound local durable Testnet record is recoverable",()=>{
 assert.equal(validateSaved(raw(),"test").url,url);
 for(const target of ["https://evil.example/paid/purchases/test?mode=durable","http://127.0.0.1:3004/paid/purchases/other?mode=durable",url.replace("durable","naive")]){
  const record=raw();record.url=target;assert.throws(()=>validateSaved(record,"test"),{code:"INVALID_RECORD"});
 }
 const wrong=raw();wrong.payload.accepted.network="stellar:pubnet";assert.throws(()=>validateSaved(wrong,"test"));
});
test("missing journal prevents any payment submission",async()=>{
 const calls:string[]=[];
 const outcome=recoverPurchase(validateSaved(raw(),"test"),{save:()=>{},fetcher:async(url)=>{calls.push(String(url));return json({},404);}});
 await assert.rejects(outcome,{code:"JOURNAL_MISSING"});
 assert.equal(calls.length,1);assert.match(calls[0]!,/reports/);
});
test("lost acknowledgment retries exact body and authorization, saving before ack",async()=>{
 const bodies:string[]=[],signatures:string[]=[],steps:string[]=[];let ack=0;
 const fetcher:typeof fetch=async(url,init)=>{
  assert.equal(init?.redirect,"error");
  if(String(url).includes("/reports/"))return json(report());
  signatures.push((init?.headers as Record<string,string>)["PAYMENT-SIGNATURE"]!);
  if(String(url).includes("/ack")){
   steps.push("ack");if(++ack===1)throw new Error("lost");
   return json({acknowledged:true});
  }
  bodies.push(String(init?.body));return json({result:{value:42},resultHash:digest({value:42})});
 };
 const outcome=await recoverPurchase(validateSaved(raw(),"test"),{attempts:2,fetcher,save:()=>steps.push("saved"),sleep:async()=>{}});
 assert.equal(outcome.code,"RECOVERED");assert.equal(ack,2);
 assert.deepEqual(bodies,[JSON.stringify(raw().body),JSON.stringify(raw().body)]);
 assert.equal(new Set(signatures).size,1);
 assert.deepEqual(steps.slice(0,4),["saved","ack","saved","ack"]);
});
test("invalid result or failed local persistence never sends acknowledgment",async()=>{
 for(const saveFails of [false,true]){
  let acknowledgments=0;
  const outcome=recoverPurchase(validateSaved(raw(),"test"),{attempts:1,save:()=>{throw new Error("disk full");},fetcher:async(url)=>{
   if(String(url).includes("/reports/"))return json(report());
   if(String(url).includes("/ack"))acknowledgments++;
   return json({result:"value",resultHash:saveFails?digest("value"):"wrong"});
  }});
  if(saveFails)assert.equal((await outcome).code,"LOCAL_SAVE_FAILED");
  else await assert.rejects(outcome,{code:"RESULT_INVALID"});
  assert.equal(acknowledgments,0);
 }
});
test("repeated unknown responses are bounded and never count as success",async()=>{
 let posts=0;const diagnostics:string[]=[];
 const result=await recoverPurchase(validateSaved(raw(),"test"),{attempts:3,save:()=>assert.fail("No result"),sleep:async()=>{},log:code=>diagnostics.push(code),fetcher:async(url)=>{
  if(String(url).includes("/reports/"))return json({...report(),verdict:"UNKNOWN",responseRecovered:false,diagnostics:[{code:"RPC_UNAVAILABLE"}]});
  posts++;return json({status:"UNKNOWN",diagnostic:{code:"RPC_UNAVAILABLE"}},202);
 }});
 assert.equal(result.code,"RPC_UNAVAILABLE");assert.equal(posts,3);assert.ok(diagnostics.includes("RPC_UNAVAILABLE"));
});
test("quickstart, integration and runner records load without inventing a body",()=>{
 const dir=mkdtempSync(join(tmpdir(),"recover-load-"));mkdirSync(join(dir,".local"));
 try{
  writeFileSync(join(dir,".local/client-test.json"),JSON.stringify(raw()));
  assert.equal(loadSaved("test",dir).url,url);
  const other=raw();other.body.invoice="different";
  mkdirSync(join(dir,".local/integration-authorizations"));
  writeFileSync(join(dir,".local/integration-authorizations/test.json"),JSON.stringify({...other,input:other.body,body:undefined}));
  assert.throws(()=>loadSaved("test",dir),{code:"AMBIGUOUS_RECORD"});
  assert.throws(()=>loadSaved("missing",dir),{code:"RECORD_MISSING"});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
