import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { x402Client } from "@x402/core/client";
import { PaymentRequiredV2Schema } from "@x402/core/schemas";
import type { PaymentRequired } from "@x402/core/types";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { config, secret, NETWORK, RPC_URL } from "../apps/demo-merchant/src/config.js";
import { digest } from "../packages/evidence/src/index.js";
import { publicReport } from "../packages/runner/src/report.js";

const root=fileURLToPath(new URL("../",import.meta.url));
process.chdir(root);
const npmCli=process.env.npm_execpath;
if(!npmCli) throw new Error("Run with npm run verify:integration.");
const c=config(), base="http://127.0.0.1:3004";
const consumer=mkdtempSync(join(tmpdir(),"chaospay-consumer-"));
const children:ChildProcess[]=[];
async function command(args:string[],cwd=root) {
  const child=spawn(process.execPath,args,{cwd,stdio:["ignore","pipe","pipe"],windowsHide:true});
  let output=""; child.stdout!.on("data",v=>output+=v); child.stderr!.on("data",v=>output+=v);
  const code=await new Promise<number|null>((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});
  if(code!==0) throw new Error("Integration command failed: "+output);
  return output;
}
async function stop(child:ChildProcess) {
  if(child.exitCode!==null||child.signalCode!==null)return;
  await new Promise<void>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error("Child stop timeout")),10000);
    child.once("exit",()=>{clearTimeout(timeout);resolve();});child.kill();
  });
}
async function start(args:string[],cwd:string,url:string,env:NodeJS.ProcessEnv=process.env) {
  const child=spawn(process.execPath,args,{cwd,env,stdio:"ignore",windowsHide:true});
  children.push(child);
  let failed=false;child.once("error",()=>{failed=true;});
  for(let i=0;i<60;i++){
    if(failed||child.exitCode!==null||child.signalCode!==null)throw new Error("Integration child failed to start.");
    if(await fetch(url+"/health",{signal:AbortSignal.timeout(800)}).then(r=>r.ok,()=>false))return child;
    await delay(500);
  }
  throw new Error("Integration readiness timeout");
}
const envFile=resolve(".env");
async function startConsumer(enableFaults:boolean) {
  return start(["--env-file="+envFile,"server.mjs"],consumer,base,{
    ...process.env,CHAOSPAY_ENABLE_FAULTS:enableFaults?"1":"0",
    INTEGRATION_DATABASE:join(consumer,".local","purchases.sqlite"),
  });
}
async function report(id:string) {
  const response=await fetch(base+"/paid/reports/"+id,{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200);
  return publicReport(await response.json());
}
try {
  for(const url of [base,c.facilitatorUrl])assert.equal(await fetch(url+"/health",{signal:AbortSignal.timeout(500)}).then(()=>true,()=>false),false,"Stop manually running services first.");
  // npm pack rebuilds the package through prepack; no prebuilt dist is required.
  cpSync(join(root,"examples/invoice-check-api"),consumer,{recursive:true,filter:path=>!/(?:^|[\\/])(?:node_modules|vendor|\.local)(?:[\\/]|$)/.test(path)});
  const vendor=join(consumer,"vendor");mkdirSync(vendor);
  const packed = JSON.parse(await command([npmCli,"--silent","pack",join(root,"packages/recovery"),"--pack-destination",vendor,"--json"])) as {name:string;version:string;integrity:string;files:{path:string}[]}[];
  assert.ok(packed[0]?.files.length);
  assert.equal(packed[0]!.name,"@chaospay/recovery");
  const publicExports = [".","./stellar-http","./evidence"];
  for (const file of packed[0]!.files) assert.ok(/^dist\/(recovery|evidence|stellar-observer)\/src\/[a-z-]+\.(js|d\.ts)$/.test(file.path) || ["README.md","package.json"].includes(file.path),"Unexpected package file: "+file.path);
  const archives=readdirSync(vendor);
  assert.deepEqual(archives,["chaospay-recovery-0.1.0.tgz"]);
  const archiveSha256=createHash("sha256").update(readFileSync(join(vendor,archives[0]!))).digest("hex");
  await command([npmCli,"install","--ignore-scripts","--no-audit","--no-fund"],consumer);
  const installed=JSON.parse(readFileSync(join(consumer,"node_modules/@chaospay/recovery/package.json"),"utf8"));
  assert.deepEqual(Object.keys(installed.exports),publicExports);
  assert.equal(installed.private,true,"Publication remains disabled");
  await command(["--test","domain.test.mjs"],consumer);
  await command([npmCli,"run","typecheck"],consumer);
  console.log("Isolated tarball installation, domain tests and TypeScript consumer: PASS");
  await start(["--import","tsx","--env-file=.env","apps/demo-merchant/src/facilitator.ts"],root,c.facilitatorUrl);
  let app=await startConsumer(false);
  assert.deepEqual(await fetch(base+"/catalog").then(r=>r.json()),{services:["invoice-arithmetic-check"]});
  const invalid=await fetch(base+"/paid/purchases/invalid",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({invoice:{lines:[]}})});
  assert.equal(invalid.status,400);
  const results=[];
  for(const fault of ["baseline","drop","crash","confirmation-lost"]){
    const id="integration-"+randomUUID();
    const input={invoice:{reference:id,lines:[{unitPriceMinor:"1250",quantity:2}],declaredTotalMinor:"2500"}};
    const url=base+"/paid/purchases/"+id+"?mode=durable";
    const body=JSON.stringify(input);
    const challengeResponse=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body});
    assert.equal(challengeResponse.status,402);
    const challenge=PaymentRequiredV2Schema.parse(await challengeResponse.json());
    assert.equal(challenge.resource?.url,url);
    const term=challenge.accepts[0]!;
    assert.equal(challenge.accepts.length,1);
    assert.equal(term.network,NETWORK);assert.equal(term.asset,c.token);
    assert.equal(term.amount,c.amount);assert.equal(term.payTo,c.recipient);
    const client=x402Client.fromConfig({schemes:[{network:NETWORK,client:new ExactStellarScheme(createEd25519Signer(secret("BUYER_SECRET"),NETWORK),{url:RPC_URL})}],
      spendControls:{allowedAssets:[{network:NETWORK,asset:c.token,maxAmountPerPayment:c.amount}]}});
    let authorizationCount=0;
    const authorize=async()=>{authorizationCount++;return client.createPaymentPayload(challenge as unknown as PaymentRequired);};
    const payload=await authorize();
    const originalAuthorizationDigest=digest(payload);
    mkdirSync(".local/integration-authorizations",{recursive:true});
    writeFileSync(".local/integration-authorizations/"+id+".json",JSON.stringify({url,input,payload}),{mode:0o600});
    const headers={"Content-Type":"application/json","PAYMENT-SIGNATURE":Buffer.from(JSON.stringify(payload)).toString("base64")};
    let purchaseRequests=0;
    const send=(hook="none",data=body)=>{
      assert.equal(digest(JSON.parse(Buffer.from(headers["PAYMENT-SIGNATURE"],"base64").toString("utf8"))),originalAuthorizationDigest);
      purchaseRequests++;
      return fetch(url,{method:"POST",headers:{...headers,"X-Chaos-Fault":hook},body:data,signal:AbortSignal.timeout(180000)});
    };
    if(fault==="baseline"){
      assert.equal((await send("drop")).status,403,"Consumer must reject fault injection by default");
      assert.equal((await fetch(base+"/paid/reports/"+id)).status,404,"Rejected hook must not create a purchase");
    }
    let interrupted:Response|undefined;
    if(fault!=="baseline") {
      try {interrupted=await send(fault);} catch(e) {
        if(!(e instanceof TypeError)||!["drop","crash"].includes(fault))throw e;
      }
      if(fault==="confirmation-lost") {assert.equal(interrupted?.status,202);assert.equal((await interrupted!.json() as {status:string}).status,"UNKNOWN");}
      else assert.equal(interrupted,undefined,"Fault must interrupt the request");
      if(fault==="crash"){await stop(app);app=await startConsumer(true);}
    }
    const before=fault==="baseline"?null:await report(id);
    if(before){assert.equal(before.verdict,"UNKNOWN");assert.equal(before.responseRecovered,false);}
    let response:Response|undefined;
    for(let i=0;i<30;i++){
      response=await send();
      if(response.status!==202)break;
      await delay(1000);
    }
    assert.equal(response?.status,200);
    const output=await response!.json() as {result:unknown;resultHash:string};
    assert.equal(digest(output.result),output.resultHash);
    assert.deepEqual(output.result,{reference:id,computedTotalMinor:"2500",declaredTotalMinor:"2500",totalsMatch:true,scope:"Arithmetic check only; no invoice payment or tax validation."});
    const modified=JSON.stringify({invoice:{...input.invoice,declaredTotalMinor:"2501"}});
    assert.equal((await send("none",modified)).status,409);
    const ack=await fetch(base+"/paid/purchases/"+id+"/ack?mode=durable",{method:"POST",headers,body:JSON.stringify({resultHash:output.resultHash})});
    assert.equal(ack.status,200);
    const after=await report(id);
    assert.equal(after.verdict,"PASS");assert.equal(after.transfers.length,1);
    assert.equal(after.settledAmountAtomic,c.amount);
    assert.equal(authorizationCount,1);
    results.push({scenario:fault,authorizationCount,purchaseRequests,originalAuthorizationReused:true,before,after});
    console.log(fault+": PASS, one confirmed payment and verified result");
    if(fault==="baseline"){await stop(app);app=await startConsumer(true);}
  }
  mkdirSync("evidence/public",{recursive:true});
  writeFileSync("evidence/public/integration-a.json",JSON.stringify({
    simulated:false,executedAt:new Date().toISOString(),integration:"invoice-check",
    scope:"Team-authored consumer installed from a tarball outside the source repository; not an external customer pilot.",
    package:"@chaospay/recovery@0.1.0",archiveSha256,archiveIntegrity:packed[0]!.integrity,publicExports,scenarios:results,
    reports:Object.fromEntries(results.map(r=>[r.after.purchaseId,r.after])),
  },null,2));
  console.log("Evidence: evidence/public/integration-a.json");
} finally {
  for(const child of children.reverse())await stop(child);
  console.log("Consumer journal preserved at: "+consumer);
}
