import test from "node:test";
import assert from "node:assert/strict";
import {validateInvoice,checkInvoice} from "./domain.mjs";
test("invoice arithmetic uses exact integers and detects mismatches",()=>{
 const input=validateInvoice({invoice:{reference:"example",lines:[{unitPriceMinor:"999999999999",quantity:10000}],declaredTotalMinor:"1"}});
 assert.equal(checkInvoice(input).computedTotalMinor,"9999999999990000");
 assert.equal(checkInvoice(input).totalsMatch,false);
});
test("invalid invoice is rejected before requesting payment",()=>{
 assert.throws(()=>validateInvoice({invoice:{reference:"bad",lines:[{unitPriceMinor:"1.25",quantity:1}],declaredTotalMinor:"1"}}));
});
