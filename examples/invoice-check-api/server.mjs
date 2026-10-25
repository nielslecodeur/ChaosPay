import express from "express";
import { createPaidRouter } from "@chaospay/recovery/stellar-http";
import { validateInvoice, checkInvoice } from "./domain.mjs";

// Existing API routes remain owned by the consuming application.
const app = express();
app.get("/health", (_req,res) => res.json({status:"ok",service:"invoice-check"}));
app.get("/catalog", (_req,res) => res.json({services:["invoice-arithmetic-check"]}));
const paid = await createPaidRouter({
  serviceId:"invoice-check",port:3004,basePath:"/paid",
  databasePath:process.env.INTEGRATION_DATABASE ?? ".local/invoice-check.sqlite",
  description:"Check invoice arithmetic; Stellar Testnet only",
  enableFaults:process.env.CHAOSPAY_ENABLE_FAULTS==="1",
  validate:validateInvoice,produce:checkInvoice,
});
app.use("/paid",paid.router);
const server = app.listen(3004,"127.0.0.1",()=>console.log("Invoice check API: http://127.0.0.1:3004"));
server.once("close",paid.close);
for(const signal of ["SIGINT","SIGTERM"]) process.on(signal,()=>server.close());
