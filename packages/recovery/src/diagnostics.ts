import type { Observation } from "../../evidence/src/index.js";
export type RecoveryCode = "NOT_SUBMITTED" | "RECEIPT_UNAVAILABLE" | "RECEIPT_MISSING" | "CONFIRMATION_PENDING" | "RPC_UNAVAILABLE" | "RPC_RESPONSE_UNREADABLE" | "PAYMENT_FAILED" | "UNSUPPORTED_EVIDENCE" | "RESULT_NOT_STORED" | "ACK_MISSING" | "COMPLETE";
export interface RecoveryDiagnostic {code:RecoveryCode;message:string;action:string;}
export function diagnose(state:{state:string;txHash:string;result:string|null;deliveries:number}, observation:Observation, receiptUnavailable=false):RecoveryDiagnostic {
 const d=(code:RecoveryCode,message:string,action:string)=>({code,message,action});
 if(state.state==="PREPARED")return d("NOT_SUBMITTED","Achat enregistré avant soumission.","Reprendre avec le corps et l'autorisation d'origine.");
 if(!state.txHash)return receiptUnavailable
  ?d("RECEIPT_UNAVAILABLE","Le reçu du facilitator est inaccessible.","Rétablir le facilitator et conserver les journaux ; ne pas signer un autre paiement.")
  :d("RECEIPT_MISSING","Aucun hash exploitable dans les journaux consultés ; paiement non exclu.","Vérifier le journal du facilitator. Intervention nécessaire si aucun reçu ne peut être retrouvé.");
 if(observation.status==="UNKNOWN"){
  if(observation.reasonCode==="RPC_UNAVAILABLE")return d("RPC_UNAVAILABLE","Le RPC ne répond pas à la vérification.","Rétablir l'accès au RPC et relancer la même reprise.");
  if(observation.reasonCode==="RPC_RESPONSE_UNREADABLE")return d("RPC_RESPONSE_UNREADABLE","La réponse RPC n'a pas pu être interprétée.","Vérifier la compatibilité de l'observateur ; préserver l'achat.");
  return d("CONFIRMATION_PENDING","Le transfert n'est pas confirmé par cette observation ; une absence dans la fenêtre RPC ne prouve pas l'échec.","Attendre puis consulter le même hash. Ne pas créer de nouvelle autorisation.");
 }
 if(observation.status==="FAILED")return d("PAYMENT_FAILED","Le paiement attendu n'est pas confirmé par les preuves disponibles.","Examiner la transaction ; aucun nouveau paiement automatique.");
 if(observation.status==="UNSUPPORTED")return d("UNSUPPORTED_EVIDENCE","Les événements de transfert ne sont pas interprétables.","Faire vérifier les preuves avant toute nouvelle opération.");
 if(state.result===null)return d("RESULT_NOT_STORED","Paiement confirmé, résultat non sauvegardé.","Reprendre le traitement déterministe avec le même achat.");
 if(!state.deliveries)return d("ACK_MISSING","Résultat sauvegardé, réception non confirmée.","Récupérer et vérifier le résultat puis envoyer l'accusé.");
 return d("COMPLETE","Paiement confirmé et résultat accusé.","Le résultat peut être restitué depuis le journal.");
}
