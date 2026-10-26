import { PaymentPayloadV2Schema } from "@x402/core/schemas";
import { digest } from "../../evidence/src/index.js";
import { asEngineReport, diagnose, type Diagnosis, type EngineReport, type FacilitatorProbe, type Facts } from "./diagnosis.js";
import { appendLog, hasValidSavedResult, loadPurchase, loopbackUrl, saveResult, type Application, type Mode } from "./local-files.js";

export interface ResumeOptions {
  dir: string; id: string; mode?: Mode; facilitatorUrl: string;
  attempts?: number; intervalMs?: number;
  fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; log?: (line: string) => void;
}
export interface ResumeResult {
  purchaseId: string; mode: Mode; application: Application; requestAssumed: boolean;
  /** État du marchand au moment de la reprise : si non joignable, `before` et `report` n'ont pas pu être lus. */
  merchant: Facts["merchant"];
  diagnosis: Diagnosis; exitCode: 0 | 1 | 2;
  before: { verdict: string; reason: string } | null;
  report: EngineReport | null; facilitator: FacilitatorProbe;
  attemptsMade: number; ageMs: number;
  files: { authorization: string; request: string | null; result: string | null; journal: string };
}

interface Reply { status: number; body: unknown; }
const SERVICE_ID: Record<Application, string> = { csv: "csv", receipt: "receipt" };
const RETRYABLE = new Set([0, 202, 503]);
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

async function call(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs: number): Promise<Reply | null> {
  try {
    const response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch { return null; } // connexion refusée, coupée ou expirée : aucune réponse
}

/**
 * Reprend un achat avec l'autorisation ORIGINALE sauvegardée. Ne signe jamais de nouvelle autorisation :
 * toute resoumission passe par le journal du marchand, qui ne règle qu'une fois.
 */
export async function resumePurchase(o: ResumeOptions): Promise<ResumeResult> {
  const fetchFn = o.fetch ?? fetch, sleep = o.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const now = o.now ?? Date.now, log = o.log ?? (() => {});
  const maxAttempts = o.attempts ?? 6, interval = o.intervalMs ?? 2000;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20)
    throw new RangeError("attempts must be an integer between 1 and 20.");
  if (!Number.isFinite(interval) || interval < 0 || interval > 60_000)
    throw new RangeError("intervalMs must be between 0 and 60000.");
  const facilitatorUrl = loopbackUrl(o.facilitatorUrl, "FACILITATOR_URL");

  const local = loadPurchase(o.dir, o.id, o.mode, now());
  const { mode, payload, request } = local;
  const merchant = request.merchantUrl;
  // Le facilitator indexe ses reçus par le digest du payload APRÈS parsing Zod (clés réordonnées, champs inconnus retirés).
  const authDigest = digest(PaymentPayloadV2Schema.parse(payload));
  const signature = b64(payload);
  const note = (step: string, detail: string) => {
    log(detail);
    try { appendLog(o.dir, mode, o.id, step, detail, new Date(now())); }
    catch (error) { console.error(`Unable to append local recovery journal (${step}):`, error); }
  };

  const getReport = async () => {
    const r = await call(fetchFn, merchant + "/reports/" + o.id + "?mode=" + mode, {}, 20_000);
    if (r?.status !== 200) return null;
    const report = asEngineReport(r.body);
    return report?.purchaseId === o.id && report.mode === mode ? report : null;
  };
  const probeFacilitator = async (): Promise<FacilitatorProbe> => {
    const r = await call(fetchFn, facilitatorUrl + "/receipts/" + authDigest, {}, 10_000);
    if (!r) return "unavailable";
    if (r.status === 404) return "no-receipt";
    if (r.status !== 200) return "unavailable";
    const tx = (r.body as { transaction?: unknown } | null)?.transaction;
    return typeof tx === "string" && tx ? "receipt-with-hash" : "receipt-without-hash";
  };

  note("start", "Reprise de « " + o.id + " » (" + mode + ", " + request.application + (local.requestAssumed ? ", requête reconstruite" : "") + ") avec l'autorisation d'origine.");
  const health = await call(fetchFn, merchant + "/health", {}, 3000);
  let transport: Facts["merchant"] = health?.status === 200 ? "ok" : "unreachable";
  if (transport === "ok" && (health!.body as { serviceId?: unknown } | null)?.serviceId !== SERVICE_ID[request.application]) transport = "wrong-service";
  note("probe", transport === "ok" ? "Marchand joignable." : transport === "wrong-service" ? "Un autre service répond à l'adresse enregistrée." : "Marchand injoignable.");

  const first = transport === "ok" ? await getReport() : null;
  const before = first ? { verdict: first.verdict, reason: first.reason } : null;
  if (transport === "ok") note("report", first ? "Verdict avant reprise : " + first.verdict + "." : "Le marchand n'a aucun journal pour cet achat.");

  let last: Facts["last"], acknowledged = false, integrityFailure = false, attemptsMade = 0;
  let resultSaved = hasValidSavedResult(o.dir, mode, o.id);
  const alreadyDone = first?.verdict === "PASS" && resultSaved;
  if (local.resultSaved && !resultSaved) note("integrity", "Le résultat local existe mais son identité ou son hash est invalide ; il sera relu depuis le marchand.");
  if (alreadyDone) note("skip", "Déjà récupéré : résultat sauvegardé et verdict PASS, aucun envoi.");

  for (let i = 1; transport === "ok" && !alreadyDone && i <= maxAttempts; i++) {
    attemptsMade = i;
    const reply = await call(fetchFn, merchant + request.path, {
      method: "POST", body: JSON.stringify(request.body),
      headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": signature, "X-Chaos-Fault": "none" },
    }, 180_000);
    last = { status: reply?.status ?? 0 };
    note("attempt", "Tentative " + i + "/" + maxAttempts + " : " + (reply ? "HTTP " + reply.status : "aucune réponse (connexion coupée)") + ".");

    if (reply?.status === 200) {
      const body = (reply.body ?? {}) as { result?: unknown; resultHash?: unknown; txHash?: unknown; recovered?: unknown };
      if (body.result === undefined || typeof body.resultHash !== "string" ||
          digest(body.result) !== body.resultHash || typeof body.txHash !== "string" ||
          !/^[a-f0-9]{64}$/i.test(body.txHash)) {
        integrityFailure = true;
        note("integrity", "Hash du résultat ou hash de transaction incohérent : pas d'accusé.");
        break;
      }
      // Résultat sauvegardé AVANT l'accusé : si l'accusé échoue ou si le processus s'arrête, rien n'est perdu.
      saveResult(o.dir, mode, o.id, { purchaseId: o.id, mode, txHash: body.txHash, resultHash: body.resultHash, savedAt: new Date(now()).toISOString(), result: body.result });
      resultSaved = true;
      note("result", "Résultat vérifié et sauvegardé.");
      const ack = await call(fetchFn, merchant + "/purchases/" + o.id + "/ack?mode=" + mode, {
        method: "POST", body: JSON.stringify({ resultHash: body.resultHash }),
        headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": signature },
      }, 10_000);
      note("ack", ack?.status === 200 ? "Accusé reçu par le marchand." : "Accusé non confirmé (" + (ack ? "HTTP " + ack.status : "aucune réponse") + ").");
      if (ack?.status === 200) { acknowledged = true; break; }
      last = { status: ack?.status ?? 0 };
      if (!RETRYABLE.has(last.status)) break;
    } else if (reply && !RETRYABLE.has(reply.status)) {
      break; // refus définitif (400, 402, 409...) : réessayer ne changerait rien
    } else if (reply?.status === 202) {
      const b = reply.body as { status?: unknown; reason?: unknown } | null;
      note("pending", "Statut " + String(b?.status ?? "UNKNOWN") + " : " + String(b?.reason ?? "confirmation non disponible") + ".");
    } // sans réponse ou HTTP 503 : le marchand redémarre peut-être, on réessaie après l'intervalle
    if (i < maxAttempts) await sleep(interval);
  }

  const report = transport === "ok" ? await getReport() : null;
  const facilitator = await probeFacilitator();
  const diagnosis = diagnose({
    merchant: transport, facilitator, report, ...(last ? { last } : {}), application: request.application,
    resultSaved, acknowledged, ...(integrityFailure ? { integrityFailure } : {}), ageMs: local.ageMs,
  });
  note("diagnosis", diagnosis.cause + " : " + diagnosis.headline + ".");
  return {
    purchaseId: o.id, mode, application: request.application, requestAssumed: local.requestAssumed, merchant: transport, diagnosis,
    exitCode: diagnosis.outcome === "done" ? 0 : diagnosis.outcome === "retry-later" ? 2 : 1,
    before, report, facilitator, attemptsMade, ageMs: local.ageMs,
    files: { authorization: local.files.authorization, request: local.requestAssumed ? null : local.files.request, result: resultSaved ? local.files.result : null, journal: local.files.journal },
  };
}
