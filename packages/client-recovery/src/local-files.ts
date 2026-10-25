import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { PaymentPayloadV2Schema } from "@x402/core/schemas";
import type { PaymentPayload } from "@x402/core/types";

export type Mode = "durable" | "naive";
export type Application = "csv" | "receipt";

/** Données locales absentes, illisibles ou incohérentes : on s'arrête avant tout envoi réseau. */
export class LocalDataError extends Error {}

export const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
export const DEFAULT_DIR = ".local";
export const LEGACY_SMOKE_BODY = { rows: [{ item: "demo", amount: 42 }, { item: "second", amount: 10 }] };

export interface LocalRequest { application: Application; merchantUrl: string; path: string; body: unknown; }
export interface LocalPurchase {
  id: string; mode: Mode; payload: PaymentPayload; request: LocalRequest;
  /** true : .local/request-*.json absent, requête reconstruite pour un ancien achat `smoke:payment`. */
  requestAssumed: boolean;
  ageMs: number; resultSaved: boolean;
  files: { authorization: string; request: string; result: string; journal: string };
}
export interface LogEntry { at: string; step: string; detail: string; }

export function filePaths(dir: string, mode: Mode, id: string) {
  const suffix = mode + "-" + id + ".json";
  return {
    authorization: join(dir, "client-" + suffix), request: join(dir, "request-" + suffix),
    result: join(dir, "result-" + suffix), journal: join(dir, "recovery-" + suffix),
  };
}

/** Les serveurs de démonstration n'écoutent que sur 127.0.0.1 : l'autorisation signée ne part jamais ailleurs. */
export function loopbackUrl(raw: unknown, label: string): string {
  let url: URL;
  try { url = new URL(String(raw)); } catch { throw new LocalDataError(label + " : URL invalide."); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" || url.search || url.hash || url.username || url.password)
    throw new LocalDataError(label + " doit être de la forme http://127.0.0.1:<port> ; l'autorisation n'est jamais envoyée ailleurs.");
  return url.origin;
}

function readJson(path: string, label: string): unknown {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw new LocalDataError(label + " illisible : " + path); }
}

export function writeJsonAtomic(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + ".tmp-" + process.pid;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, path); // jamais de fichier à moitié écrit : on garde l'ancien ou le nouveau
}

export function appendLog(dir: string, mode: Mode, id: string, step: string, detail: string, now = new Date()) {
  const path = filePaths(dir, mode, id).journal;
  let entries: LogEntry[] = [];
  try { const old = JSON.parse(readFileSync(path, "utf8")); if (Array.isArray(old)) entries = old as LogEntry[]; } catch { /* premier passage */ }
  entries.push({ at: now.toISOString(), step, detail });
  writeJsonAtomic(path, entries.slice(-200));
}

export function saveResult(dir: string, mode: Mode, id: string, record: Record<string, unknown>) {
  writeJsonAtomic(filePaths(dir, mode, id).result, record);
}

export function listPurchases(dir: string, now = Date.now()) {
  if (!existsSync(dir)) return [];
  const found: { id: string; mode: Mode; ageMs: number; hasRequest: boolean; resultSaved: boolean }[] = [];
  for (const name of readdirSync(dir)) {
    const m = /^client-(durable|naive)-([a-zA-Z0-9_-]{1,80})\.json$/.exec(name);
    if (!m) continue;
    const mode = m[1] as Mode, id = m[2]!, paths = filePaths(dir, mode, id);
    found.push({ id, mode, ageMs: Math.max(0, now - statSync(paths.authorization).mtimeMs), hasRequest: existsSync(paths.request), resultSaved: existsSync(paths.result) });
  }
  return found.sort((a, b) => a.ageMs - b.ageMs);
}

function validateRequest(value: unknown, id: string, mode: Mode): LocalRequest {
  const r = value as Partial<LocalRequest> | null;
  if (!r || typeof r !== "object" || !["csv", "receipt"].includes(String(r.application)) || typeof r.path !== "string" || r.body === undefined)
    throw new LocalDataError("Fichier de requête invalide.");
  const merchantUrl = loopbackUrl(r.merchantUrl, "merchantUrl");
  if (r.path !== "/purchases/" + id + "?mode=" + mode)
    throw new LocalDataError("La requête sauvegardée ne correspond pas à l'achat " + id + " (" + mode + ").");
  return { application: r.application as Application, merchantUrl, path: r.path, body: r.body };
}

export function loadPurchase(dir: string, id: string, requestedMode?: Mode, now = Date.now(), env: NodeJS.ProcessEnv = process.env): LocalPurchase {
  if (!ID_PATTERN.test(id)) throw new LocalDataError("Identifiant d'achat invalide (1 à 80 caractères : lettres, chiffres, - ou _).");
  const modes: Mode[] = requestedMode ? [requestedMode] : (["durable", "naive"] as const).filter(m => existsSync(filePaths(dir, m, id).authorization));
  if (!modes.length) throw new LocalDataError("Aucune autorisation sauvegardée pour « " + id + " » dans " + dir + ". Lancez `npm run recover -- --list` pour voir les achats retrouvables.");
  if (modes.length > 1) throw new LocalDataError("« " + id + " » existe en mode durable et naive : précisez --mode durable ou --mode naive.");
  const mode = modes[0]!, files = filePaths(dir, mode, id);
  if (!existsSync(files.authorization)) throw new LocalDataError("Aucune autorisation sauvegardée pour « " + id + " » en mode " + mode + ".");
  let payload: PaymentPayload;
  try { payload = PaymentPayloadV2Schema.parse(readJson(files.authorization, "Autorisation")) as unknown as PaymentPayload; }
  catch (e) { if (e instanceof LocalDataError) throw e; throw new LocalDataError("Autorisation sauvegardée invalide : " + files.authorization); }

  let request: LocalRequest, requestAssumed = false;
  if (existsSync(files.request)) request = validateRequest(readJson(files.request, "Requête"), id, mode);
  else {
    // Anciens achats `smoke:payment` : le corps était fixe. Si l'hypothèse est fausse, le marchand répond 409 avant tout paiement.
    request = { application: "csv", merchantUrl: loopbackUrl(env.MERCHANT_URL ?? "http://127.0.0.1:3001", "MERCHANT_URL"), path: "/purchases/" + id + "?mode=" + mode, body: LEGACY_SMOKE_BODY };
    requestAssumed = true;
  }
  if ((payload as { resource?: { url?: string } }).resource?.url !== request.merchantUrl + request.path)
    throw new LocalDataError("L'autorisation sauvegardée appartient à une autre URL que « " + request.merchantUrl + request.path + " » ; elle ne sera pas envoyée.");
  return {
    id, mode, payload, request, requestAssumed, files,
    ageMs: Math.max(0, now - statSync(files.authorization).mtimeMs), resultSaved: existsSync(files.result),
  };
}
