import test from "node:test";
import assert from "node:assert/strict";
import {diagnose} from "../packages/recovery/src/diagnostics.js";
import type {Observation} from "../packages/evidence/src/index.js";
const state={state:"UNKNOWN",txHash:"hash",result:null,deliveries:0};
const unknown:Observation={status:"UNKNOWN",txHash:"hash",transfers:[],reason:"test"};
test("recovery distinguishes receipt, RPC, result and acknowledgment states",()=>{
 assert.equal(diagnose({...state,state:"PREPARED",txHash:""},unknown).code,"NOT_SUBMITTED");
 assert.equal(diagnose({...state,txHash:""},unknown).code,"RECEIPT_MISSING");
 assert.equal(diagnose({...state,txHash:""},unknown,true).code,"RECEIPT_UNAVAILABLE");
 assert.equal(diagnose(state,{...unknown,reasonCode:"RPC_UNAVAILABLE"}).code,"RPC_UNAVAILABLE");
 assert.equal(diagnose(state,{...unknown,reasonCode:"NOT_FOUND"}).code,"CONFIRMATION_PENDING");
 const confirmed={...unknown,status:"CONFIRMED" as const};
 assert.equal(diagnose(state,confirmed).code,"RESULT_NOT_STORED");
 assert.equal(diagnose({...state,result:'"saved"'},confirmed).code,"ACK_MISSING");
 assert.equal(diagnose({...state,result:'"saved"',deliveries:1},confirmed).code,"COMPLETE");
});
