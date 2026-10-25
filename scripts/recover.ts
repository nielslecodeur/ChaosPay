import {resolve,join} from "node:path";
import {loadSaved,recoverPurchase,saveRecovered,RecoveryStop} from "./lib/recover.js";
const args=process.argv.slice(2),id=args.shift();
if(!id||id==="--help"){
 console.log("npm run recover -- <purchaseId> [--directory <dossier-client>] [--file <sauvegarde.json>] [--attempts 1..10]");
 process.exit(id==="--help"?0:1);
}
try{
 let directory=process.cwd(),file:string|undefined,attempts=3;
 while(args.length){
  const flag=args.shift(),value=args.shift();if(!value)throw new Error("Missing argument");
  if(flag==="--directory")directory=resolve(value);
  else if(flag==="--file")file=value;
  else if(flag==="--attempts")attempts=Number(value);
  else throw new Error("Unknown argument");
 }
 const saved=loadSaved(id,directory,file);
 const output=join(directory,".local","recovered-"+id+".json");
 const outcome=await recoverPurchase(saved,{attempts,save:value=>saveRecovered(output,value),log:code=>console.log("Diagnostic : "+code)});
 // Do not print bodies, payloads, raw network errors or private results.
 console.log(JSON.stringify({purchaseId:id,code:outcome.code,message:outcome.message,action:outcome.action,...(outcome.code==="RECOVERED"?{resultFile:output}:{})},null,2));
 process.exitCode=outcome.code==="RECOVERED"?0:2;
}catch(e){
 console.log(JSON.stringify(e instanceof RecoveryStop?{code:e.code,message:e.message,action:e.action}:{code:"INVALID_ARGUMENTS",message:"Vérifier les arguments ; utiliser --help."},null,2));
 process.exitCode=1;
}
