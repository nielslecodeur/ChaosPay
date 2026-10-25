import type { Observation, PurchaseReport } from "../../evidence/src/index.js";

/** Ce que le facilitator dit de l'autorisation (GET /receipts/:digest), interrogé directement par le client. */
export type FacilitatorProbe = "receipt-with-hash" | "receipt-without-hash" | "no-receipt" | "unavailable";
/** done : terminé · retry-later : relancer la même commande plus tard est sûr · needs-human : relancer ne changera rien. */
export type Outcome = "done" | "retry-later" | "needs-human";
export type Cause =
  | "RECOVERED" | "RESULT_NOT_ACKNOWLEDGED" | "CONFIRMATION_PENDING" | "RPC_UNAVAILABLE" | "RECEIPT_ABSENT"
  | "FACILITATOR_UNAVAILABLE" | "PAYMENT_FAILED" | "PAYMENT_UNSUPPORTED" | "DOUBLE_PAYMENT"
  | "AUTHORIZATION_REJECTED" | "REQUEST_MISMATCH" | "RESULT_INTEGRITY"
  | "SERVICE_UNREACHABLE" | "SERVICE_ERROR" | "WRONG_SERVICE" | "REPORT_UNAVAILABLE";

export interface Diagnosis { cause: Cause; outcome: Outcome; headline: string; why: string; action: string; }
export type EngineReport = PurchaseReport & {
  observations?: Observation[];
  attempts?: { state: string; txHash: string; deliveries: number }[];
};
export interface Facts {
  merchant: "ok" | "unreachable" | "wrong-service";
  facilitator: FacilitatorProbe;
  /** null : le marchand n'a aucun journal pour cet achat (404) ou est injoignable. */
  report: EngineReport | null;
  /** Dernière réponse du marchand à la reprise. 0 : aucune réponse (connexion coupée). */
  last?: { status: number };
  application: "csv" | "receipt";
  resultSaved: boolean;
  acknowledged: boolean;
  integrityFailure?: boolean;
  ageMs: number;
}

/** Fenêtre de validité d'une autorisation : maxTimeoutSeconds: 120 dans packages/recovery/src/stellar-http.ts. À garder alignée. */
export const AUTH_WINDOW_MS = 120_000;
const ONE_HOUR_MS = 3_600_000;

const verdicts = ["PASS", "FAIL", "UNKNOWN", "UNSUPPORTED"];
export function asEngineReport(value: unknown): EngineReport | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Partial<EngineReport>;
  if (r.schemaVersion !== 1 || typeof r.verdict !== "string" || !verdicts.includes(r.verdict) || !Array.isArray(r.transfers)) return null;
  return value as EngineReport;
}

export const short = (hash: string) => hash ? hash.slice(0, 12) + "…" : "aucun";
const d = (cause: Cause, outcome: Outcome, headline: string, why: string, action: string): Diagnosis => ({ cause, outcome, headline, why, action });
const knownHashes = (r: EngineReport) => [...(r.observations ?? []).map(o => o.txHash), ...(r.attempts ?? []).map(a => a.txHash)].filter(Boolean);
const minutes = (ms: number) => ms < 90_000 ? Math.round(ms / 1000) + " s" : Math.round(ms / 60_000) + " min";

export function diagnose(f: Facts): Diagnosis {
  const r = f.report, status = f.last?.status;
  const startMerchant = f.application === "receipt" ? "npm run dev:receipt" : "npm run dev:merchant";

  if (f.integrityFailure)
    return d("RESULT_INTEGRITY", "needs-human", "Résultat reçu mais hash incohérent",
      "Le hash du résultat renvoyé par le marchand ne correspond pas à son contenu. Aucun accusé n'a été envoyé et le résultat n'a pas été enregistré comme valide.",
      "Ne pas utiliser ce résultat. Le paiement et l'autorisation sont conservés ; relancer la commande ne corrigera pas une incohérence du marchand : l'investiguer côté service.");
  if (f.merchant === "wrong-service")
    return d("WRONG_SERVICE", "needs-human", "Mauvais service à l'adresse enregistrée",
      "L'adresse du marchand répond, mais ne s'identifie pas comme le service de cet achat. L'autorisation n'a pas été envoyée.",
      "Démarrer le bon service (" + startMerchant + ") sur l'adresse enregistrée dans le fichier de requête, puis relancer.");
  if (status === 409 || status === 400)
    return d("REQUEST_MISMATCH", "needs-human", "Requête locale refusée par le marchand",
      "Le marchand refuse la requête ou l'autorisation sauvegardées pour cet identifiant (HTTP " + status + ") : corps différent de l'achat d'origine ou autorisation rattachée à un autre achat. Aucun paiement n'a été déclenché par ce refus.",
      "Vérifier que le fichier request-*.json est celui de l'achat d'origine, sans le modifier. Pour un ancien achat sans ce fichier, la requête était reconstruite : retrouver le corps d'origine ou abandonner cet achat.");
  if (status === 402 && !(r && knownHashes(r).length))
    return d("AUTHORIZATION_REJECTED", "needs-human", "Autorisation refusée avant tout règlement",
      "Le marchand n'a pas validé l'autorisation sauvegardée (expirée — fenêtre d'environ " + minutes(AUTH_WINDOW_MS) + " — ou invalide) et n'a enregistré aucun achat : rien n'a été réglé par son intermédiaire.",
      "Un nouvel achat exige une nouvelle autorisation, donc un nouveau paiement : à lancer explicitement (par exemple npm run smoke:payment -- <nouvel-identifiant> durable none). `recover` ne re-signe jamais.");

  if (!r) {
    if (f.acknowledged)
      return d("REPORT_UNAVAILABLE", "retry-later", "Résultat accusé, bilan de preuve indisponible",
        "Le résultat a été reçu, vérifié, enregistré et accusé, mais le rapport de l'observateur n'a pas pu être relu.",
        "Relancer la même commande quand le marchand répond pour obtenir le verdict PASS ou UNKNOWN.");
    if (f.merchant === "unreachable" || status === 0)
      return d("SERVICE_UNREACHABLE", "retry-later", "Marchand injoignable",
        "Le marchand ne répond pas (arrêté, en cours de redémarrage ou connexion coupée). Son journal SQLite et votre autorisation sont conservés ; rien n'a été renvoyé.",
        "Démarrer le marchand (" + startMerchant + "), puis relancer la même commande.");
    return d("SERVICE_ERROR", "retry-later", "Le marchand a signalé une erreur" + (status ? " (HTTP " + status + ")" : ""),
      "Le marchand a interrompu l'opération et n'a pas pu fournir de rapport. L'autorisation d'origine reste valable côté journal.",
      "Relancer la même commande dans quelques secondes ; consulter les journaux du marchand si l'erreur persiste.");
  }

  const obs = r.observations ?? [], hashes = knownHashes(r), hash = hashes[0] ?? "";
  if (r.verdict === "PASS")
    return d("RECOVERED", "done", "Achat récupéré",
      "Un seul paiement attendu est confirmé sur le ledger (tx " + short(hash) + "), le résultat a été vérifié par son hash puis accusé.",
      f.resultSaved ? "Rien à faire. Le résultat est sauvegardé localement." : "Rien à faire.");
  if (r.verdict === "FAIL") {
    if (BigInt(r.settledAmountAtomic) > BigInt(r.expectedAmountAtomic))
      return d("DOUBLE_PAYMENT", "needs-human", "Plusieurs paiements confirmés pour un achat",
        r.settledAmountAtomic + " unités atomiques confirmées pour " + r.expectedAmountAtomic + " attendues (transactions : " + hashes.map(short).join(", ") + ").",
        "Ne pas relancer. Conserver le rapport et les hashes pour un rapprochement manuel.");
    return d("PAYMENT_FAILED", "needs-human", "Paiement non valide",
      (obs.find(o => o.status === "FAILED")?.reason ?? r.reason) + " (tx " + short(hash) + ").",
      "Aucun paiement conforme n'est confirmé. Relancer ne changera rien ; un nouvel achat avec une nouvelle autorisation est une décision à prendre explicitement.");
  }
  if (r.verdict === "UNSUPPORTED")
    return d("PAYMENT_UNSUPPORTED", "needs-human", "Transfert non interprétable",
      "Les événements de la transaction " + short(hash) + " ne permettent pas de confirmer un transfert attendu.",
      "Vérifier la transaction sur un explorateur Stellar Testnet ; l'observateur ne peut pas conclure.");

  // verdict UNKNOWN : distinguer précisément pourquoi.
  if (obs.length && obs.every(o => o.status === "CONFIRMED"))
    return d("RESULT_NOT_ACKNOWLEDGED", "retry-later", "Paiement confirmé, résultat non accusé",
      "Le transfert est confirmé (tx " + short(hash) + ") mais le marchand n'a pas reçu l'accusé de réception du résultat" + (f.resultSaved ? " ; le résultat est déjà sauvegardé localement." : "."),
      "Relancer la même commande : le résultat enregistré est restitué sans nouveau paiement, puis accusé.");

  const rpcDown = obs.some(o => o.status === "UNKNOWN" && /^Observer RPC unavailable/.test(o.reason));
  const pending = obs.some(o => o.status === "UNKNOWN" && o.txHash && /^Not found in this RPC observation window/.test(o.reason));
  const noHash = obs.some(o => o.status === "UNKNOWN" && !o.txHash);
  const old = f.ageMs > ONE_HOUR_MS ? " L'achat date de plus d'une heure : l'historique du RPC est limité, vérifier aussi le hash sur un explorateur Stellar Testnet." : "";

  if (rpcDown)
    return d("RPC_UNAVAILABLE", "retry-later", "RPC Stellar indisponible",
      "Le marchand n'a pas pu interroger le RPC Stellar (injoignable ou réponse illisible). L'état du paiement est inconnu, pas échoué" + (hash ? " (tx " + short(hash) + ")." : "."),
      "Relancer plus tard la même commande (npm run check:connections teste le RPC). Aucune nouvelle autorisation, aucun nouveau paiement." + old);
  if (pending)
    return d("CONFIRMATION_PENDING", "retry-later", "Confirmation en attente",
      "La transaction " + short(hash) + " est connue, mais le RPC ne la voit pas encore. Ce n'est pas une preuve d'échec : le règlement peut être en cours.",
      "Relancer la même commande dans quelques secondes. Aucune nouvelle autorisation, aucun nouveau paiement." + old);

  if (noHash || !obs.length) {
    if (f.facilitator === "unavailable")
      return d("FACILITATOR_UNAVAILABLE", "retry-later", "Facilitator injoignable",
        "Le marchand n'a enregistré aucune transaction et le facilitator ne répond pas : impossible de savoir si la demande y a été enregistrée.",
        "Démarrer le facilitator (npm run dev:facilitator), puis relancer la même commande. S'il n'a alors aucun reçu, le diagnostic deviendra « reçu absent ».");
    if (f.facilitator === "receipt-with-hash")
      return d("CONFIRMATION_PENDING", "retry-later", "Confirmation en attente",
        "Le facilitator connaît une transaction pour cette autorisation, que le marchand n'a pas encore relue.",
        "Relancer la même commande dans quelques secondes. Aucune nouvelle autorisation, aucun nouveau paiement.");
    const states = (r.attempts ?? []).map(a => a.state).join(", ") || "inconnu";
    const expired = f.ageMs > AUTH_WINDOW_MS ? " L'autorisation date de " + minutes(f.ageMs) + " : une resoumission serait probablement rejetée (fenêtre d'environ " + minutes(AUTH_WINDOW_MS) + ")." : "";
    if (f.facilitator === "receipt-without-hash")
      return d("RECEIPT_ABSENT", f.ageMs <= AUTH_WINDOW_MS ? "retry-later" : "needs-human", "Reçu incomplet : demande enregistrée, aucune transaction",
        "Le facilitator a enregistré la demande mais aucune transaction signée n'y est associée : règlement en cours, ou interrompu avant la signature. Le facilitator ne resoumet jamais de lui-même (journal du marchand : " + states + ")." + expired,
        f.ageMs <= AUTH_WINDOW_MS ? "Patienter une à deux minutes puis relancer la même commande."
          : "Vérifier sur un explorateur Stellar Testnet les transferts récents du compte acheteur vers le marchand. Aucun transfert : l'achat n'a pas eu lieu et un nouvel achat exigera une nouvelle autorisation (décision explicite). Transfert trouvé : conserver son hash pour le rapprochement.");
    return d("RECEIPT_ABSENT", "needs-human", "Reçu absent",
      "Le marchand n'a enregistré aucune transaction et le facilitator n'a aucun reçu pour cette autorisation (journal du marchand : " + states + "). L'absence de reçu ne prouve pas l'absence de paiement, et le marchand ne resoumet jamais une autorisation déjà tentée : relancer la commande ne changera rien." + expired,
      "Vérifier sur un explorateur Stellar Testnet les transferts récents du compte acheteur vers le marchand. Aucun transfert : l'achat n'a pas eu lieu et un nouvel achat exigera une nouvelle autorisation (décision explicite). Transfert trouvé : conserver son hash pour le rapprochement.");
  }

  return d("SERVICE_ERROR", "retry-later", "Preuve incomplète",
    r.reason, "Relancer la même commande ; si l'état persiste, conserver le rapport de l'observateur.");
}
