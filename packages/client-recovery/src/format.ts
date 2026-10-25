import { short } from "./diagnosis.js";
import type { ResumeResult } from "./resume.js";

const wrap = (text: string, indent: string, width = 92) => {
  const lines: string[] = []; let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > width - indent.length) { lines.push(line); line = word; } else line = line ? line + " " + word : word;
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i ? indent : "") + l).join("\n");
};

const STATUS = { done: "TERMINÉ", "retry-later": "EN ATTENTE — relancer la même commande plus tard est sûr", "needs-human": "BLOQUÉ — décision humaine nécessaire" } as const;

export function formatBilan(r: ResumeResult): string {
  const rep = r.report, indent = "  ";
  const paid = rep ? rep.transfers.length + " transfert(s) observé(s) · " + rep.settledAmountAtomic + " / " + rep.expectedAmountAtomic + " unités atomiques" : "non vérifiable (rapport indisponible)";
  const tx = rep?.transfers[0]?.txHash ?? rep?.observations?.find(o => o.txHash)?.txHash ?? "";
  const lines = [
    "ChaosPay — reprise de l'achat « " + r.purchaseId + " »  (" + r.mode + " · " + r.application + ")",
    "",
    indent + "Verdict avant  : " + (r.before ? r.before.verdict : r.merchant === "ok" ? "aucun journal côté marchand (jamais reçu)" : "non consulté (marchand injoignable)"),
    indent + "Verdict après  : " + (rep ? rep.verdict : "indisponible"),
    indent + "Tentatives     : " + r.attemptsMade + " (autorisation d'origine, aucune re-signature)",
    indent + "Paiements      : " + paid + (tx ? " · tx " + short(tx) : ""),
    "",
    indent + STATUS[r.diagnosis.outcome] + " : " + r.diagnosis.headline,
    indent + "Pourquoi : " + wrap(r.diagnosis.why, indent + " ".repeat(11)),
    indent + "Action   : " + wrap(r.diagnosis.action, indent + " ".repeat(11)),
  ];
  if (r.requestAssumed) lines.push("", indent + "Note : aucun fichier de requête trouvé ; le corps de démonstration `smoke:payment` a été supposé (sans effet de paiement si faux : le marchand répond 409).");
  lines.push("", indent + "Données conservées");
  lines.push(indent + "  autorisation : " + r.files.authorization);
  if (r.files.request) lines.push(indent + "  requête      : " + r.files.request);
  if (r.files.result) lines.push(indent + "  résultat     : " + r.files.result);
  lines.push(indent + "  journal      : " + r.files.journal);
  return lines.join("\n");
}
