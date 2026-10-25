import express, { type ErrorRequestHandler } from "express";
import { rpc } from "@stellar/stellar-sdk";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { PaymentPayload } from "@x402/core/types";
import { PaymentPayloadV2Schema } from "@x402/core/schemas";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { observe } from "../../stellar-observer/src/index.js";
import { config, NETWORK, RPC_URL, PASSPHRASE } from "./testnet-config.js";
import { RecoveryKit, Store, RecoveryError, FaultTriggered, faults, type Fault } from "./index.js";

export interface PaidService<I,O> {
  serviceId: string; port: number; databasePath: string; description: string;
  validate: (body: unknown) => I;
  produce: (input: I, context: { purchaseId: string; txHash: string; buyer: string }) => O | Promise<O>;
  legacyCsv?: boolean;
  basePath?: string;
  enableFaults?: boolean;
}
export async function createPaidRouter<I,O>(service: PaidService<I,O>) {
  const mount = service.basePath ?? "";
  if (!Number.isInteger(service.port) || service.port < 1 || service.port > 65535) throw new Error("Invalid service port.");
  if (mount && !/^\/(?:[a-zA-Z0-9_-]+)(?:\/[a-zA-Z0-9_-]+)*$/.test(mount)) throw new Error("Invalid basePath.");
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(service.serviceId)) throw new Error("Invalid serviceId.");
  const c = config(), base = "http://127.0.0.1:" + service.port + mount;
  const observer = new rpc.Server(RPC_URL);
  if ((await observer.getNetwork()).passphrase !== PASSPHRASE) throw new Error("Unexpected RPC network.");
  const resource = new x402ResourceServer(new HTTPFacilitatorClient({url:c.facilitatorUrl})).register(NETWORK,new ExactStellarScheme());
  await resource.initialize();
  const requirements = (await resource.buildPaymentRequirements({
    scheme:"exact",network:NETWORK,payTo:c.recipient,price:{asset:c.token,amount:c.amount},maxTimeoutSeconds:120,
  }))[0]!;
  const store = new Store(service.databasePath);
  if (service.legacyCsv) store.migrateLegacyCsv();
  const kit = new RecoveryKit<PaymentPayload,I,O>({
    store,serviceId:service.serviceId,tokenContract:c.token,recipient:c.recipient,amountAtomic:c.amount,produce:service.produce,
    gateway: {
      verify: payload => resource.verifyPayment(payload,requirements),
      async settle(payload,withoutConfirmation) {
        if (!withoutConfirmation) return resource.settlePayment(payload,requirements);
        const r = await fetch(c.facilitatorUrl+"/submit",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({paymentPayload:payload,paymentRequirements:requirements}),signal:AbortSignal.timeout(20000),
        });
        if (r.status !== 202) throw new Error("Facilitator submission unavailable.");
        return {}; // Explicitly discard confirmation; recovery must consult the durable receipt.
      },
      async receipt(authDigest) {
        const r = await fetch(c.facilitatorUrl+"/receipts/"+authDigest,{signal:AbortSignal.timeout(15000)});
        if (r.status===404) return {};
        if (!r.ok) throw new Error("Receipt temporarily unavailable.");
        return await r.json() as {transaction?:string};
      },
      observe: (hash,expected) => observe(observer,hash,expected),
    },
  });
  const app = express();
  app.use(express.json({limit:"64kb"}));
  app.use((_,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
  app.get("/health",(_,res)=>res.json({status:"ok",network:NETWORK,serviceId:service.serviceId,tokenContract:c.token,amountAtomic:c.amount,assetSymbol:"XLM",assetDecimals:7}));
  function mode(value: unknown): "durable" | "naive" {
    if (value === undefined || value === "durable") return "durable";
    if (value === "naive") return "naive";
    throw new RecoveryError(400,"Invalid mode.");
  }
  function payload(header: string | undefined): PaymentPayload {
    if (!header || header.length>100000) throw new RecoveryError(400,"Original payment payload required.");
    return PaymentPayloadV2Schema.parse(JSON.parse(Buffer.from(header,"base64").toString("utf8"))) as unknown as PaymentPayload;
  }
  app.post("/purchases/:id",async(req,res,next)=>{
    try {
      const id=req.params.id, m=mode(req.query.mode);
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new RecoveryError(400,"Invalid purchaseId.");
      let input: I;
      try { input=service.validate(req.body); } catch { throw new RecoveryError(400,"Invalid service input."); }
      const url=base+"/purchases/"+id+"?mode="+m;
      if (!req.get("PAYMENT-SIGNATURE")) {
        const challenge=await resource.createPaymentRequiredResponse([requirements],{url,description:service.description,mimeType:"application/json"});
        res.setHeader("PAYMENT-REQUIRED",Buffer.from(JSON.stringify(challenge)).toString("base64"));
        res.status(402).json(challenge); return;
      }
      const p=payload(req.get("PAYMENT-SIGNATURE"));
      if (p.resource?.url !== url) throw new RecoveryError(409,"Authorization belongs to another service or purchase.");
      const fault=req.get("X-Chaos-Fault")??"none";
      if (fault !== "none" && !service.enableFaults) throw new RecoveryError(403,"Fault injection is disabled for this integration.");
      if (!faults.includes(fault as Fault)) throw new RecoveryError(400,"Unsupported fault.");
      const result=await kit.execute({purchaseId:id,mode:m,payload:p,input,fault:fault as Fault});
      if (result.status!=="READY") {res.status(202).json({purchaseId:id,...result});return;}
      res.setHeader("PAYMENT-RESPONSE",Buffer.from(JSON.stringify({success:true,network:NETWORK,transaction:result.txHash})).toString("base64"));
      res.json({purchaseId:id,mode:m,...result,...(service.legacyCsv?{csv:result.result,csvHash:result.resultHash}:{})});
    } catch(error) {
      if (error instanceof FaultTriggered) {
        if (error.fault==="crash") process.exit(86);
        req.socket.destroy(); return;
      }
      next(error);
    }
  });
  app.post("/purchases/:id/ack",(req,res,next)=>{
    try {
      kit.acknowledge(req.params.id,mode(req.query.mode),payload(req.get("PAYMENT-SIGNATURE")),req.body?.resultHash??req.body?.csvHash);
      res.json({acknowledged:true});
    } catch(e){next(e);}
  });
  app.get("/reports/:id",async(req,res,next)=>{
    try {res.json(await kit.report(req.params.id,mode(req.query.mode)));}catch(e){next(e);}
  });
  const errors: ErrorRequestHandler=(e,_req,res,_next)=>{
    const status=e instanceof RecoveryError?e.status:e instanceof SyntaxError||e?.name==="ZodError"?400:503;
    res.status(status).json({error:e instanceof RecoveryError?e.message:"Operation interrupted; preserve the original authorization."});
  };
  app.use(errors);
  return {router:app,close:()=>store.close()};
}

export async function createPaidService<I,O>(service: PaidService<I,O>) {
  if (service.basePath) throw new Error("Use createPaidRouter to mount under basePath.");
  const paid = await createPaidRouter({...service,enableFaults:service.enableFaults ?? true});
  const server=paid.router.listen(service.port,"127.0.0.1",()=>console.log(service.serviceId+": http://127.0.0.1:"+service.port+" (Testnet)"));
  server.once("close",paid.close);
  return server;
}
