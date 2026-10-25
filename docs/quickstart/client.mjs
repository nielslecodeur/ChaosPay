// Demonstration client, not a published agent SDK. Run from the independent project.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { x402Client } from "@x402/core/client";
import { PaymentRequiredV2Schema } from "@x402/core/schemas";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { Asset, Networks } from "@stellar/stellar-sdk";
import { digest } from "@chaospay/recovery/evidence";

const id=process.argv[2],fault=process.argv[3]??"none";
if(!id || !/^[a-zA-Z0-9_-]{1,60}$/.test(id) || !["none","drop","crash","confirmation-lost"].includes(fault))
  throw new Error("Usage: node --env-file=.env.client client.mjs <unique-id> [none|drop|crash|confirmation-lost]");
const url="http://127.0.0.1:3004/paid/purchases/"+id+"?mode=durable";
const body={invoice:{reference:id,lines:[{unitPriceMinor:"1250",quantity:2}],declaredTotalMinor:"2500"}};
const path=".local/client-"+id+".json";
mkdirSync(".local",{recursive:true});
let saved;
if(existsSync(path)){
  saved=JSON.parse(readFileSync(path,"utf8"));
  assert.equal(saved.url,url);assert.equal(digest(saved.body),digest(body));
  console.log("Original authorization reused.");
}else{
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  assert.equal(response.status,402);
  const challenge=PaymentRequiredV2Schema.parse(await response.json());
  const term=challenge.accepts[0];
  const asset=Asset.native().contractId(Networks.TESTNET);
  const amount=process.env.PAYMENT_AMOUNT_ATOMIC??"100000";
  assert.equal(challenge.accepts.length,1);assert.equal(challenge.resource?.url,url);
  assert.equal(term.network,"stellar:testnet");assert.equal(term.asset,asset);
  assert.equal(term.payTo,process.env.MERCHANT_ADDRESS);assert.equal(term.amount,amount);
  const client=x402Client.fromConfig({schemes:[{network:"stellar:testnet",client:new ExactStellarScheme(
    createEd25519Signer(process.env.BUYER_SECRET,"stellar:testnet"),{url:"https://soroban-testnet.stellar.org"})}],
    spendControls:{allowedAssets:[{network:"stellar:testnet",asset,maxAmountPerPayment:amount}]}});
  const payload=await client.createPaymentPayload(challenge);
  saved={url,body,payload};
  writeFileSync(path,JSON.stringify(saved),{mode:0o600});
  console.log("Original authorization saved before submission.");
}
const headers={"Content-Type":"application/json","PAYMENT-SIGNATURE":Buffer.from(JSON.stringify(saved.payload)).toString("base64")};
let response;
try {
  response=await fetch(url,{method:"POST",headers:{...headers,"X-Chaos-Fault":fault},body:JSON.stringify(saved.body),signal:AbortSignal.timeout(180000)});
}catch{
  console.log("Response unavailable. Keep .local; restart the API if needed, then repeat the SAME id with none.");
  process.exit(2);
}
if(response.status===202){console.log("UNKNOWN: wait, then repeat the SAME id with none.");process.exit(2);}
assert.equal(response.status,200,"Unexpected HTTP status: "+response.status);
const result=await response.json();
assert.equal(digest(result.result),result.resultHash);
const ack=await fetch(url.replace("?mode=durable","/ack?mode=durable"),{method:"POST",headers,body:JSON.stringify({resultHash:result.resultHash})});
assert.equal(ack.status,200);
const reportResponse=await fetch("http://127.0.0.1:3004/paid/reports/"+id);
assert.equal(reportResponse.status,200);
const report=await reportResponse.json();
assert.equal(report.verdict,"PASS");assert.equal(report.transfers.length,1);
assert.equal(report.settledAmountAtomic,process.env.PAYMENT_AMOUNT_ATOMIC??"100000");
writeFileSync(".local/report-"+id+".json",JSON.stringify(report,null,2));
console.log(JSON.stringify({verdict:report.verdict,transactions:report.transfers.length,result:result.result,txHash:result.txHash}));
