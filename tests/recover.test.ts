import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PaymentPayloadV2Schema } from "@x402/core/schemas";
import type { PaymentPayload } from "@x402/core/types";
import { RecoveryKit, RecoveryError, FaultTriggered, Store, type Fault, type PaymentGateway } from "../packages/recovery/src/index.js";
import { digest } from "../packages/evidence/src/index.js";
import { observe as realObserve } from "../packages/stellar-observer/src/index.js";
import { diagnose, type Facts } from "../packages/client-recovery/src/diagnosis.js";
import { formatBilan } from "../packages/client-recovery/src/format.js";
import { filePaths, listPurchases, loadPurchase, LocalDataError, type Mode } from "../packages/client-recovery/src/local-files.js";
import { resumePurchase } from "../packages/client-recovery/src/resume.js";

const MERCHANT = "http://127.0.0.1:3001", FACILITATOR = "http://127.0.0.1:4022";
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");
const BODY = { rows: [{ item: "demo", amount: 42 }] };
const payloadFor = (url: string) => ({
  x402Version: 2, resource: { url, description: "d", mimeType: "application/json" },
  accepted: { scheme: "exact", network: "stellar:testnet", asset: "C".repeat(56), amount: "100000", payTo: "G".repeat(56), maxTimeoutSeconds: 120, extra: {} },
  payload: { transaction: "AAAA" },
});

/** Vrai RecoveryKit + vrai Store SQLite + vrai observateur, derrière un faux réseau pilotable. */
class World {
  dir = mkdtempSync(join(tmpdir(), "chaospay-recover-"));
  store = new Store(join(this.dir, "merchant.sqlite"));
  settleCalls = 0; facilitatorUp = true; merchantUp = true; verifyOk = true;
  rpc: "visible" | "pending" | "down" = "visible";
  failAcks = 0; dropResponses = 0; fetchCalls = 0;
  receipts = new Map<string, string>(); calls: string[] = []; faultHeaders: string[] = [];
  private gateway: PaymentGateway<PaymentPayload> = {
    verify: async () => this.verifyOk ? { isValid: true, payer: "buyer" } : { isValid: false },
    settle: async (payload, withoutConfirmation) => {
      this.settleCalls++;
      if (!this.facilitatorUp) throw new Error("ECONNREFUSED");
      const tx = String(this.receipts.size + 1).padStart(64, "a");
      this.receipts.set(digest(payload), tx);
      return withoutConfirmation ? {} : { success: true, transaction: tx };
    },
    receipt: async digestKey => {
      if (!this.facilitatorUp) throw new Error("ECONNREFUSED");
      const tx = this.receipts.get(digestKey); return tx ? { transaction: tx } : {};
    },
    observe: async (hash, expected) => {
      const server = (getTransaction: () => Promise<unknown>) => ({ getTransaction }) as unknown as Parameters<typeof realObserve>[0];
      if (!hash) return realObserve(server(async () => { throw new Error("unused"); }), hash, expected);
      if (this.rpc === "down") return realObserve(server(async () => { throw new Error("offline"); }), hash, expected);
      if (this.rpc === "pending") return realObserve(server(async () => ({ status: "NOT_FOUND" })), hash, expected);
      return { status: "CONFIRMED", txHash: hash, reason: "test", transfers: [{ txHash: hash, ledger: 1, ...expected }] };
    },
  };
  kit = new RecoveryKit<PaymentPayload, unknown, unknown>({ store: this.store, gateway: this.gateway, serviceId: "csv", tokenContract: "token", recipient: "merchant", amountAtomic: "100000", produce: input => ({ echo: input }) });

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    this.fetchCalls++;
    const url = new URL(String(input)), method = init?.method ?? "GET", headers = new Headers(init?.headers);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.origin === FACILITATOR) {
      if (!this.facilitatorUp) throw new TypeError("fetch failed");
      const tx = this.receipts.get(url.pathname.split("/").pop()!);
      return tx ? json(200, { success: true, transaction: tx }) : json(404, { error: "No receipt; not proof of nonpayment." });
    }
    if (url.origin !== MERCHANT || !this.merchantUp) throw new TypeError("fetch failed");
    this.calls.push(method + " " + url.pathname);
    const mode = (url.searchParams.get("mode") ?? "durable") as Mode;
    try {
      if (url.pathname === "/health") return json(200, { status: "ok", serviceId: "csv" });
      const report = /^\/reports\/([^/]+)$/.exec(url.pathname);
      if (report) return json(200, await this.kit.report(report[1]!, mode));
      const payload = PaymentPayloadV2Schema.parse(JSON.parse(Buffer.from(headers.get("PAYMENT-SIGNATURE")!, "base64").toString("utf8"))) as unknown as PaymentPayload;
      const ack = /^\/purchases\/([^/]+)\/ack$/.exec(url.pathname);
      if (ack) {
        if (this.failAcks > 0) { this.failAcks--; return json(503, { error: "interrupted" }); }
        this.kit.acknowledge(ack[1]!, mode, payload, JSON.parse(String(init?.body)).resultHash);
        return json(200, { acknowledged: true });
      }
      const purchase = /^\/purchases\/([^/]+)$/.exec(url.pathname)!;
      this.faultHeaders.push(headers.get("X-Chaos-Fault") ?? "none");
      if ((payload as { resource?: { url?: string } }).resource?.url !== MERCHANT + url.pathname + url.search) throw new RecoveryError(409, "Authorization belongs to another service or purchase.");
      const result = await this.kit.execute({ purchaseId: purchase[1]!, mode, payload, input: JSON.parse(String(init?.body)), fault: (headers.get("X-Chaos-Fault") ?? "none") as Fault });
      if (result.status !== "READY") return json(202, { purchaseId: purchase[1], ...result });
      if (this.dropResponses > 0) { this.dropResponses--; throw new TypeError("fetch failed"); } // traité côté marchand, réponse perdue
      return json(200, { purchaseId: purchase[1], mode, ...result });
    } catch (e) {
      if (e instanceof FaultTriggered || e instanceof TypeError) throw new TypeError("fetch failed");
      return json(e instanceof RecoveryError ? e.status : 503, { error: String(e) });
    }
  };

  /** Fichiers locaux seuls : le client est mort après la sauvegarde, avant tout envoi. */
  seed(id: string, mode: Mode = "durable") {
    const path = "/purchases/" + id + "?mode=" + mode, payload = payloadFor(MERCHANT + path), paths = filePaths(this.dir, mode, id);
    writeFileSync(paths.authorization, JSON.stringify(payload));
    writeFileSync(paths.request, JSON.stringify({ application: "csv", merchantUrl: MERCHANT, path, body: BODY }));
    return { path, payload, paths };
  }
  /** Rejoue ce que fait le client d'origine (runner ou smoke:payment) : sauvegarde, puis envoi qui échoue. */
  async start(id: string, fault: Fault, mode: Mode = "durable") {
    const { path, payload, paths } = this.seed(id, mode);
    try { await this.fetch(MERCHANT + path, { method: "POST", body: JSON.stringify(BODY), headers: { "PAYMENT-SIGNATURE": b64(payload), "X-Chaos-Fault": fault } }); } catch { /* coupure voulue */ }
    return { payload, paths };
  }
  recover(id: string, extra: { attempts?: number; mode?: Mode } = {}) {
    return resumePurchase({ dir: this.dir, id, facilitatorUrl: FACILITATOR, fetch: this.fetch, sleep: async () => {}, attempts: extra.attempts ?? 3, intervalMs: 0, ...(extra.mode ? { mode: extra.mode } : {}) });
  }
  purchasePosts() { return this.calls.filter(c => c === "POST /purchases/" + c.split("/")[2]).length; }
  close() { this.store.close(); rmSync(this.dir, { recursive: true, force: true }); }
}
async function world(run: (w: World) => Promise<void>) { const w = new World(); try { await run(w); } finally { w.close(); } }

// ── Reprise après chaque panne contrôlée ──────────────────────────────────────────────────────
for (const fault of ["before-submit", "drop", "crash", "confirmation-lost"] as Fault[]) {
  test("recover " + fault + " : une commande récupère l'achat sans second paiement", () => world(async w => {
    const { paths } = await w.start("achat-1", fault);
    const r = await w.recover("achat-1");
    assert.equal(r.diagnosis.cause, "RECOVERED"); assert.equal(r.exitCode, 0);
    assert.equal(r.report?.verdict, "PASS"); assert.equal(w.settleCalls, 1);
    assert.deepEqual(JSON.parse(readFileSync(paths.result, "utf8")).result, { echo: BODY });
    assert.match(formatBilan(r), /TERMINÉ : Achat récupéré/);
  }));
}
test("recover relancé après PASS : aucun nouvel envoi, aucun paiement, résultat intact", () => world(async w => {
  await w.start("achat-1", "drop");
  await w.recover("achat-1");
  const posts = w.purchasePosts(), settles = w.settleCalls;
  const again = await w.recover("achat-1");
  assert.equal(again.diagnosis.cause, "RECOVERED"); assert.equal(again.attemptsMade, 0);
  assert.equal(w.purchasePosts(), posts); assert.equal(w.settleCalls, settles); assert.equal(settles, 1);
}));
test("client mort avant tout envoi : la reprise fait la première soumission, sans aucune panne injectée", () => world(async w => {
  w.seed("achat-1");
  const r = await w.recover("achat-1");
  assert.equal(r.before, null); assert.equal(r.diagnosis.cause, "RECOVERED"); assert.equal(r.attemptsMade, 1);
  assert.equal(w.settleCalls, 1);
  assert.ok(w.faultHeaders.length > 0 && w.faultHeaders.every(h => h === "none"), "la reprise ne doit jamais injecter de panne");
}));
test("une reprise inconnue sans payload n'invente rien", () => world(async w => {
  await assert.rejects(w.recover("inconnu"), LocalDataError);
  assert.equal(w.fetchCalls, 0);
}));

// ── Les quatre états inconnus, expliqués ──────────────────────────────────────────────────────
test("confirmation en attente : tx connue, RPC ne la voit pas encore, puis résolution", () => world(async w => {
  await w.start("achat-1", "confirmation-lost"); w.rpc = "pending";
  const r = await w.recover("achat-1");
  assert.equal(r.diagnosis.cause, "CONFIRMATION_PENDING"); assert.equal(r.diagnosis.outcome, "retry-later"); assert.equal(r.exitCode, 2);
  assert.equal(w.settleCalls, 1);
  w.rpc = "visible";
  assert.equal((await w.recover("achat-1")).diagnosis.cause, "RECOVERED"); assert.equal(w.settleCalls, 1);
}));
test("RPC indisponible : distingué de l'attente, jamais de resoumission", () => world(async w => {
  await w.start("achat-1", "confirmation-lost"); w.rpc = "down";
  const r = await w.recover("achat-1", { attempts: 4 });
  assert.equal(r.diagnosis.cause, "RPC_UNAVAILABLE"); assert.equal(r.exitCode, 2); assert.equal(w.settleCalls, 1);
  assert.ok(existsSync(r.files.authorization));
}));
test("résultat non accusé : résultat sauvegardé avant l'accusé, puis accusé à la relance", () => world(async w => {
  const { paths } = await w.start("achat-1", "ack-lost"); w.failAcks = 5;
  const r = await w.recover("achat-1", { attempts: 2 });
  assert.equal(r.diagnosis.cause, "RESULT_NOT_ACKNOWLEDGED"); assert.equal(r.exitCode, 2);
  assert.ok(existsSync(paths.result)); assert.equal(r.files.result, paths.result);
  w.failAcks = 0;
  assert.equal((await w.recover("achat-1")).diagnosis.cause, "RECOVERED"); assert.equal(w.settleCalls, 1);
}));
test("reçu absent : blocage détecté et expliqué, aucun nouveau paiement, données conservées", () => world(async w => {
  // Limite connue du moteur : un règlement échoué (facilitator arrêté) laisse l'achat en UNKNOWN sans hash,
  // et le kit ne resoumet jamais. Ce test documente le blocage ; il échouera le jour où le moteur sait le résoudre.
  w.facilitatorUp = false; const { paths } = await w.start("achat-1", "none");
  w.facilitatorUp = true;
  const r = await w.recover("achat-1", { attempts: 3 });
  assert.equal(r.diagnosis.cause, "RECEIPT_ABSENT"); assert.equal(r.diagnosis.outcome, "needs-human"); assert.equal(r.exitCode, 1);
  assert.equal(w.settleCalls, 1); assert.equal(w.receipts.size, 0);
  assert.ok(existsSync(paths.authorization) && existsSync(paths.request) && existsSync(paths.journal));
  assert.match(r.diagnosis.why, /ne prouve pas l'absence de paiement/);
}));
test("facilitator injoignable : demandé de le relancer, pas de verdict définitif", () => world(async w => {
  w.facilitatorUp = false; await w.start("achat-1", "none");
  const r = await w.recover("achat-1", { attempts: 2 });
  assert.equal(r.diagnosis.cause, "FACILITATOR_UNAVAILABLE"); assert.equal(r.exitCode, 2); assert.equal(r.facilitator, "unavailable");
}));

// ── Pannes pendant la reprise elle-même ───────────────────────────────────────────────────────
test("réponse perdue pendant la reprise : nouvelle tentative, un seul paiement", () => world(async w => {
  await w.start("achat-1", "drop"); w.dropResponses = 1;
  const r = await w.recover("achat-1", { attempts: 3 });
  assert.equal(r.diagnosis.cause, "RECOVERED"); assert.equal(w.settleCalls, 1); assert.equal(r.attemptsMade, 2);
}));
test("reprise à une seule tentative, réponse perdue : relancer termine sans nouveau paiement", () => world(async w => {
  await w.start("achat-1", "drop"); w.dropResponses = 1;
  const first = await w.recover("achat-1", { attempts: 1 });
  assert.equal(first.diagnosis.cause, "RESULT_NOT_ACKNOWLEDGED"); assert.equal(first.files.result, null);
  assert.equal((await w.recover("achat-1")).diagnosis.cause, "RECOVERED"); assert.equal(w.settleCalls, 1);
}));
test("marchand injoignable : rien n'est envoyé, données conservées", () => world(async w => {
  const { paths } = await w.start("achat-1", "drop"); w.merchantUp = false;
  const posts = w.purchasePosts();
  const r = await w.recover("achat-1");
  assert.equal(r.diagnosis.cause, "SERVICE_UNREACHABLE"); assert.equal(r.exitCode, 2); assert.equal(r.attemptsMade, 0);
  assert.equal(w.purchasePosts(), posts); assert.ok(existsSync(paths.authorization));
  w.merchantUp = true; assert.equal((await w.recover("achat-1")).diagnosis.cause, "RECOVERED"); assert.equal(w.settleCalls, 1);
}));

// ── Refus et garde-fous ───────────────────────────────────────────────────────────────────────
test("corps modifié : 409 expliqué, aucun nouveau paiement", () => world(async w => {
  const { paths } = await w.start("achat-1", "drop");
  writeFileSync(paths.request, JSON.stringify({ application: "csv", merchantUrl: MERCHANT, path: "/purchases/achat-1?mode=durable", body: { rows: [{ item: "autre" }] } }));
  const r = await w.recover("achat-1");
  assert.equal(r.diagnosis.cause, "REQUEST_MISMATCH"); assert.equal(r.exitCode, 1); assert.equal(w.settleCalls, 1);
}));
test("autorisation refusée avant règlement : décision humaine, jamais de re-signature", () => world(async w => {
  w.verifyOk = false; await w.start("achat-1", "none");
  const r = await w.recover("achat-1");
  assert.equal(r.diagnosis.cause, "AUTHORIZATION_REJECTED"); assert.equal(r.exitCode, 1); assert.equal(w.settleCalls, 0);
  assert.match(r.diagnosis.action, /ne re-signe jamais/);
}));
test("l'autorisation ne part jamais vers une adresse non locale (chaque barrière testée seule)", () => world(async w => {
  const { paths } = await w.start("achat-1", "drop");
  // Barrière 1 : adresse du marchand. L'autorisation est rattachée à la même fausse URL, donc seule loopbackUrl peut refuser.
  const evil = "http://evil.example:3001", path = "/purchases/achat-1?mode=durable";
  writeFileSync(paths.authorization, JSON.stringify(payloadFor(evil + path)));
  writeFileSync(paths.request, JSON.stringify({ application: "csv", merchantUrl: evil, path, body: BODY }));
  const before = w.fetchCalls;
  await assert.rejects(w.recover("achat-1"), /127\.0\.0\.1/);
  assert.equal(w.fetchCalls, before);
  // Barrière 2 : adresse du facilitator, avec des fichiers locaux sains.
  w.seed("achat-2");
  await assert.rejects(resumePurchase({ dir: w.dir, id: "achat-2", facilitatorUrl: "http://evil.example:4022", fetch: w.fetch }), /FACILITATOR_URL/);
  assert.equal(w.fetchCalls, before);
}));
test("autorisation rattachée à une autre URL : refusée avant tout envoi", () => world(async w => {
  const { paths } = await w.start("achat-1", "drop");
  writeFileSync(paths.authorization, JSON.stringify(payloadFor(MERCHANT + "/purchases/autre?mode=durable")));
  const before = w.fetchCalls;
  await assert.rejects(w.recover("achat-1"), LocalDataError);
  assert.equal(w.fetchCalls, before);
}));
test("identifiant existant dans les deux modes : demande --mode ; identifiant dangereux refusé", () => world(async w => {
  await w.start("achat-1", "drop", "durable"); await w.start("achat-1", "drop", "naive");
  await assert.rejects(w.recover("achat-1"), /--mode/);
  assert.equal((await w.recover("achat-1", { mode: "durable" })).mode, "durable");
  assert.throws(() => loadPurchase(w.dir, "../secret"), LocalDataError);
}));
test("ancien achat sans fichier de requête : requête reconstruite et signalée", () => world(async w => {
  await w.start("achat-1", "drop");
  rmSync(filePaths(w.dir, "durable", "achat-1").request);
  const r = await resumePurchase({ dir: w.dir, id: "achat-1", facilitatorUrl: FACILITATOR, fetch: w.fetch, sleep: async () => {}, attempts: 1 });
  assert.equal(r.requestAssumed, true); // le corps de démonstration diffère de BODY : 409, jamais un paiement
  assert.equal(r.diagnosis.cause, "REQUEST_MISMATCH"); assert.equal(w.settleCalls, 1);
  assert.match(formatBilan(r), /corps de démonstration/);
}));
test("le reçu du facilitator est retrouvé même si le fichier d'autorisation a un autre ordre de clés", () => world(async w => {
  const { paths, payload } = await w.start("achat-1", "confirmation-lost"); w.rpc = "down";
  const reordered = Object.fromEntries([...Object.entries({ ...payload, inconnu: 1 })].reverse());
  assert.notEqual(digest(reordered), digest(PaymentPayloadV2Schema.parse(reordered)));
  writeFileSync(paths.authorization, JSON.stringify(reordered));
  const r = await w.recover("achat-1", { attempts: 1 });
  assert.equal(r.facilitator, "receipt-with-hash");
}));
test("listPurchases retrouve les achats et leur état", () => world(async w => {
  await w.start("achat-1", "drop"); await w.recover("achat-1"); await w.start("achat-2", "drop");
  const found = listPurchases(w.dir);
  assert.deepEqual(found.map(p => [p.id, p.resultSaved]).sort(), [["achat-1", true], ["achat-2", false]]);
}));

// ── Diagnostic pur ────────────────────────────────────────────────────────────────────────────
const base: Facts = { merchant: "ok", facilitator: "no-receipt", report: null, application: "csv", resultSaved: false, acknowledged: false, ageMs: 1000 };
const report = (verdict: string, extra: Record<string, unknown> = {}) => ({ schemaVersion: 1, purchaseId: "p", mode: "durable", network: "stellar:testnet", tokenContract: "t", expectedAmountAtomic: "100", settledAmountAtomic: "100", transfers: [], responseRecovered: false, verdict, reason: "r", ...extra }) as unknown as Facts["report"];
test("diagnose : cas limites", () => {
  assert.equal(diagnose({ ...base, integrityFailure: true }).cause, "RESULT_INTEGRITY");
  assert.equal(diagnose({ ...base, merchant: "wrong-service" }).cause, "WRONG_SERVICE");
  assert.equal(diagnose({ ...base, report: report("FAIL", { settledAmountAtomic: "200" }) }).cause, "DOUBLE_PAYMENT");
  assert.equal(diagnose({ ...base, report: report("FAIL", { observations: [{ status: "FAILED", txHash: "a".repeat(64), transfers: [], reason: "Ledger confirmed failure." }] }) }).cause, "PAYMENT_FAILED");
  assert.equal(diagnose({ ...base, report: report("UNSUPPORTED") }).cause, "PAYMENT_UNSUPPORTED");
  assert.equal(diagnose({ ...base, acknowledged: true }).cause, "REPORT_UNAVAILABLE");
  const noHash = report("UNKNOWN", { observations: [{ status: "UNKNOWN", txHash: "", transfers: [], reason: "No valid transaction hash." }], attempts: [{ state: "UNKNOWN", txHash: "", deliveries: 0 }] });
  const fresh = diagnose({ ...base, facilitator: "receipt-without-hash", report: noHash });
  assert.equal(fresh.outcome, "retry-later");
  assert.equal(diagnose({ ...base, facilitator: "receipt-without-hash", report: noHash, ageMs: 10 * 60_000 }).outcome, "needs-human");
  assert.match(diagnose({ ...base, report: noHash, ageMs: 10 * 60_000 }).why, /resoumission serait probablement rejetée/);
});
