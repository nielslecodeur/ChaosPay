import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync,rmSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {randomUUID} from "node:crypto";
import {PaymentPayloadV2Schema} from "@x402/core/schemas";
import {Asset,Networks} from "@stellar/stellar-sdk";
import {digest} from "../../packages/evidence/src/index.js";

export class RecoveryStop extends Error {
 constructor(public code:string,message:string,public action:string){super(message);}
}
export interface SavedPurchase {url:string;body:unknown;payload:ReturnType<typeof PaymentPayloadV2Schema.parse>;}
export function validateSaved(value:unknown,id:string):SavedPurchase {
 try {
  const record=value as Record<string,unknown>;
  const url=new URL(String(record.url));
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || url.protocol!=="http:" || url.hostname!=="127.0.0.1" || url.username || url.password || url.hash ||
     !url.pathname.endsWith("/purchases/"+id) || !/^\/(?:[a-zA-Z0-9_-]+\/)*purchases\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
     url.search!=="?mode=durable" || record.body===undefined)throw new Error();
  const payload=PaymentPayloadV2Schema.parse(record.payload);
  if(payload.resource?.url!==url.href || payload.accepted.network!=="stellar:testnet" ||
     payload.accepted.asset!==Asset.native().contractId(Networks.TESTNET) || !/^[1-9][0-9]*$/.test(payload.accepted.amount))throw new Error();
  return {url:url.href,body:record.body,payload};
 }catch{throw new RecoveryStop("INVALID_RECORD","L'achat sauvegardé ne correspond pas à cette reprise locale Testnet.","Utiliser le fichier original, son identifiant et le mode durable ; aucune nouvelle autorisation ne sera créée.");}
}
export function loadSaved(id:string,directory=process.cwd(),file?:string):SavedPurchase {
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new RecoveryStop("INVALID_ID","Identifiant invalide.","Utiliser l'identifiant original.");
 try {
  if(file)return validateSaved(JSON.parse(readFileSync(resolve(directory,file),"utf8")),id);
  const local=join(directory,".local"),candidates:SavedPurchase[]=[];
  for(const name of [join("integration-authorizations",id+".json"),"client-"+id+".json"]){
   const path=join(local,name);
   if(existsSync(path)){const raw=JSON.parse(readFileSync(path,"utf8"));candidates.push(validateSaved({...raw,body:raw.body??raw.input},id));}
  }
  const request=join(local,"request-durable-"+id+".json"),payload=join(local,"client-durable-"+id+".json");
  if(existsSync(request)&&existsSync(payload)){
   const raw=JSON.parse(readFileSync(request,"utf8"));
   candidates.push(validateSaved({url:raw.url??new URL(raw.path,raw.merchantUrl).href,body:raw.body,payload:JSON.parse(readFileSync(payload,"utf8"))},id));
  }
  if(!candidates.length)throw new RecoveryStop("RECORD_MISSING","Corps, URL ou autorisation d'origine introuvables.","Indiquer --directory pour le dossier du client, ou --file pour un enregistrement complet. Ne pas reconstruire le corps au hasard.");
  if(new Set(candidates.map(digest)).size!==1)throw new RecoveryStop("AMBIGUOUS_RECORD","Plusieurs sauvegardes différentes correspondent à cet identifiant.","Choisir explicitement le fichier original avec --file.");
  return candidates[0]!;
 }catch(e){if(e instanceof RecoveryStop)throw e;throw new RecoveryStop("RECORD_UNREADABLE","La sauvegarde ne peut pas être lue.","Vérifier le chemin et préserver les fichiers d'origine.");}
}
export function saveRecovered(path:string,value:unknown){
 mkdirSync(dirname(path),{recursive:true});
 const temp=path+"."+randomUUID()+".tmp";
 try{writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});renameSync(temp,path);}
 finally{rmSync(temp,{force:true});}
}
interface Outcome {code:string;message:string;action:string;result?:unknown;resultHash?:string;report?:unknown;}
interface Options {attempts?:number;fetcher?:typeof fetch;sleep?:(ms:number)=>Promise<unknown>;save:(value:unknown)=>void;log?:(code:string)=>void;}
export async function recoverPurchase(saved:SavedPurchase,options:Options):Promise<Outcome>{
 const fetcher=options.fetcher??fetch,attempts=options.attempts??3;
 if(!Number.isInteger(attempts)||attempts<1||attempts>10)throw new RecoveryStop("INVALID_ATTEMPTS","Nombre de tentatives invalide.","Choisir entre 1 et 10.");
 const headers={"Content-Type":"application/json","PAYMENT-SIGNATURE":Buffer.from(JSON.stringify(saved.payload)).toString("base64")};
 const purchase=new URL(saved.url),reportUrl=new URL(saved.url),ackUrl=new URL(saved.url);
 reportUrl.pathname=purchase.pathname.replace(/\/purchases\//,"/reports/");
 ackUrl.pathname+="/ack";
 const request=(url:string,init?:RequestInit)=>fetcher(url,{...init,redirect:"error",signal:AbortSignal.timeout(20000)});
 let last:Outcome={code:"PENDING",message:"Reprise incomplète.",action:"Conserver les fichiers et relancer le même achat."};
 async function readReport(){
  const r=await request(reportUrl.href);
  if(r.status===404)throw new RecoveryStop("JOURNAL_MISSING","Le serveur ne retrouve pas cet achat.","Restaurer le journal du bon service. Aucun paiement n'a été soumis par cette commande.");
  if(r.status!==200)throw new Error("Report unavailable");
  const report=await r.json() as Record<string,any>;
  if(report.purchaseId!==purchase.pathname.split("/").at(-1) || report.mode!=="durable" || report.network!=="stellar:testnet" ||
     report.tokenContract!==saved.payload.accepted.asset || report.expectedAmountAtomic!==saved.payload.accepted.amount)
   throw new RecoveryStop("REPORT_MISMATCH","Le rapport ne correspond pas à l'achat sauvegardé.","Vérifier le service et la sauvegarde d'origine.");
  return report;
 }
 for(let attempt=0;attempt<attempts;attempt++){
  let phase="report";
  try{
   const before=await readReport();
   for(const diagnostic of before.diagnostics??[])if(typeof diagnostic.code==="string")options.log?.(diagnostic.code);
   if(["FAIL","UNSUPPORTED"].includes(before.verdict))throw new RecoveryStop("MANUAL_REVIEW","Les preuves demandent une vérification manuelle.","Examiner les transferts avant toute reprise.");
   phase="purchase";
   const response=await request(saved.url,{method:"POST",headers,body:JSON.stringify(saved.body)});
   if([400,401,402,403,409].includes(response.status))throw new RecoveryStop("PURCHASE_REJECTED","La reprise a été refusée (HTTP "+response.status+").","Vérifier le corps, l'autorisation et le journal ; ne pas re-signer.");
   if(response.status===202){
    const pending=await response.json() as Record<string,any>;
    last={code:typeof pending.diagnostic?.code==="string"?pending.diagnostic.code:"CONFIRMATION_PENDING",
      message:"Le moteur ne peut pas encore confirmer le résultat.",
      action:"Consulter les diagnostics du rapport et réessayer le même achat."};
   }else{
    if(response.status!==200)throw new Error("Purchase unavailable");
    const output=await response.json() as Record<string,unknown>;
    const result=Object.hasOwn(output,"result")?output.result:output.csv,hash=output.resultHash??output.csvHash;
    if(result===undefined || typeof hash!=="string" || digest(result)!==hash)
     throw new RecoveryStop("RESULT_INVALID","L'intégrité du résultat n'est pas vérifiée.","Aucun accusé envoyé. Préserver l'achat pour investigation.");
    // Persist result before acknowledgment: a killed client can rerun safely.
    phase="save";options.save({purchaseId:purchase.pathname.split("/").at(-1),result,resultHash:hash,acknowledged:false});
    phase="ack";
    const ack=await request(ackUrl.href,{method:"POST",headers,body:JSON.stringify({resultHash:hash})});
    if(ack.status!==200)throw new Error("Ack unavailable");
    phase="report";
    const after=await readReport();
    const transfers=after.transfers;
    if(after.verdict!=="PASS" || !after.responseRecovered || !Array.isArray(transfers) || transfers.length!==1 ||
       transfers[0].amountAtomic!==saved.payload.accepted.amount || transfers[0].tokenContract!==saved.payload.accepted.asset ||
       transfers[0].to!==saved.payload.accepted.payTo || after.settledAmountAtomic!==saved.payload.accepted.amount){
     last={code:"EVIDENCE_PENDING",message:"Résultat reçu et accusé ; bilan final non confirmé.",action:"Consulter les preuves et relancer le même achat."};
    }else{
     options.save({purchaseId:after.purchaseId,result,resultHash:hash,acknowledged:true});
     return {code:"RECOVERED",message:"Résultat récupéré ; un règlement attendu et un accusé sont confirmés.",action:"Conserver les journaux.",result,resultHash:hash};
    }
   }
  }catch(e){
   if(e instanceof RecoveryStop)throw e;
   last=phase==="save"?{code:"LOCAL_SAVE_FAILED",message:"Impossible de sauvegarder le résultat ; aucun nouvel accusé envoyé.",action:"Vérifier les droits et l'espace disque, puis reprendre le même achat."}
    :phase==="ack"?{code:"ACK_UNCONFIRMED",message:"Résultat sauvegardé localement, accusé non confirmé.",action:"Relancer la même reprise ; ne pas créer de nouvelle autorisation."}
    :{code:phase==="report"?"REPORT_UNAVAILABLE":"SERVICE_UNAVAILABLE",message:"Le service ou sa réponse est inaccessible.",action:"Redémarrer le bon service avec ses journaux, puis relancer le même achat."};
  }
  options.log?.(last.code);
  if(attempt+1<attempts)await (options.sleep??(ms=>new Promise(r=>setTimeout(r,ms))))(1000);
 }
 return last;
}
