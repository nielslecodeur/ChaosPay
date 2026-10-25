import { createPaidService } from "../../../packages/recovery/src/stellar-http.js";
import { validateInvoice, makeReceipt } from "./receipt.js";
await createPaidService({
  serviceId:"receipt",port:3003,databasePath:".local/receipt-api.sqlite",
  description:"Generate a JSON receipt; Stellar Testnet XLM only",
  validate:validateInvoice,produce:makeReceipt,
});
