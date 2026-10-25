import { createPaidService } from "../../../packages/recovery/src/stellar-http.js";
import { config } from "./config.js";
import { toCsv, validateRows } from "./conversion.js";
const c=config();
await createPaidService({
  serviceId:"csv",port:Number(process.env.MERCHANT_PORT??3001),databasePath:c.databasePath,
  description:"Deterministic JSON to CSV; Stellar Testnet XLM only",
  validate:(body: unknown)=>validateRows((body as {rows?:unknown})?.rows),
  produce:rows=>toCsv(rows),legacyCsv:true,
});
