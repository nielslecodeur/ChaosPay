import { parseArgs } from "node:util";
import { formatBilan } from "../packages/client-recovery/src/format.js";
import { DEFAULT_DIR, listPurchases, LocalDataError, type Mode } from "../packages/client-recovery/src/local-files.js";
import { resumePurchase } from "../packages/client-recovery/src/resume.js";

const HELP = `Usage : npm run recover -- <achat> [options]
        npm run recover -- --list

Reprend un achat interrompu avec l'autorisation ORIGINALE sauvegardée dans .local/ :
consulte le marchand et le facilitator, rejoue la requête sans re-signer, vérifie le hash du
résultat, le sauvegarde, envoie l'accusé et affiche un bilan. Si elle ne peut pas conclure,
elle explique pourquoi et conserve toutes les données. Elle ne crée jamais de nouveau paiement.

Les serveurs doivent tourner (npm run dev:facilitator, puis dev:merchant ou dev:receipt).

Options
  --mode durable|naive   Requis seulement si l'identifiant existe dans les deux modes
  --attempts N           Tentatives maximum, entier de 1 à 20 (défaut 6)
  --interval S           Secondes entre tentatives, de 0 à 60 (défaut 2)
  --json                 Bilan en JSON sur la sortie standard (progression sur stderr)
  --list                 Liste les achats retrouvables dans .local/
  --dir <dossier>        Dossier des fichiers locaux (défaut .local)

Code de sortie : 0 terminé · 1 bloqué ou erreur (décision humaine) · 2 en attente (relancer plus tard)`;

function fail(message: string): never { console.error(message); process.exit(1); }

let args;
try {
  args = parseArgs({ allowPositionals: true, options: {
    mode: { type: "string" }, attempts: { type: "string" }, interval: { type: "string" },
    json: { type: "boolean" }, list: { type: "boolean" }, help: { type: "boolean", short: "h" }, dir: { type: "string" },
  } });
} catch (e) { fail((e as Error).message + "\n\n" + HELP); }
const { values, positionals } = args;
if (values.help) { console.log(HELP); process.exit(0); }
const dir = values.dir ?? DEFAULT_DIR;

if (values.list) {
  const found = listPurchases(dir);
  if (!found.length) console.log("Aucun achat retrouvable dans " + dir + ".");
  for (const p of found) console.log(p.id.padEnd(40) + p.mode.padEnd(8) + (p.resultSaved ? "résultat sauvegardé" : "résultat absent").padEnd(22) + (p.hasRequest ? "" : "requête absente (ancien achat)"));
  process.exit(0);
}

const id = positionals[0];
if (!id || positionals.length > 1) fail("Indiquez un identifiant d'achat.\n\n" + HELP);
if (values.mode !== undefined && values.mode !== "durable" && values.mode !== "naive") fail("--mode doit valoir durable ou naive.");
const number = (raw: string | undefined, name: string, fallback: number, min: number, max: number, integer = false) => {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail(name + " invalide.");
  return n;
};

try {
  const result = await resumePurchase({
    dir, id, ...(values.mode ? { mode: values.mode as Mode } : {}),
    facilitatorUrl: process.env.FACILITATOR_URL ?? "http://127.0.0.1:4022",
    attempts: number(values.attempts, "--attempts", 6, 1, 20, true),
    intervalMs: number(values.interval, "--interval", 2, 0, 60) * 1000,
    log: line => console.error("· " + line),
  });
  console.log(values.json ? JSON.stringify(result, null, 2) : "\n" + formatBilan(result));
  process.exitCode = result.exitCode;
} catch (error) {
  if (error instanceof LocalDataError) fail(error.message);
  throw error;
}
