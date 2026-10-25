const $ = id => document.getElementById(id);
const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const badge = (text, tone = '') => el('span', text, `badge ${tone}`);
const apps = { csv: 'Conversion CSV', receipt: 'Génération de reçus', 'invoice-check': 'Vérification de facture · paquet installé séparément' };
const scenarios = {
  comparison: ['Comparer deux façons de reprendre', 'Après une réponse perdue, comparer un nouveau paiement et la récupération de l’achat existant.'],
  drop: ['La réponse disparaît', 'Le paiement est confirmé, mais le client ne reçoit pas sa réponse.'],
  crash: ['L’application s’arrête', 'L’application redémarre après le paiement et doit retrouver l’achat.'],
  'confirmation-lost': ['La confirmation est inaccessible', 'Le paiement a été soumis. Son état reste inconnu jusqu’au retour de la confirmation.'],
  'ack-lost': ['La réception ne peut pas être confirmée', 'Le résultat arrive, mais son accusé de réception est perdu.'],
  'before-submit': ['La panne arrive avant le paiement', 'La demande est interrompue avant l’envoi du paiement.'],
  concurrent: ['Le client envoie deux demandes', 'Deux demandes simultanées concernent le même achat.'],
  baseline: ['Tout se passe bien', 'Un achat sans panne, pour établir une référence.'],
};
const sourceText = { SIMULATED: 'SIMULATION · données fictives', TESTNET: 'TESTNET · exécution réelle', ARCHIVE: 'ARCHIVE · preuves historiques' };
const statusText = { RUNNING: 'En cours', COMPLETE: 'Terminé', INTERRUPTED: 'Interrompu' };
let state = { scenarios: [], runs: [], busy: false }, selected, previous = '', pending = false, reachable = false;
const xlm = atomic => { const n = BigInt(atomic); return `${n / 10000000n},${(n % 10000000n).toString().padStart(7, '0')} XLM`; };
const titleOf = run => run.integrationEvidence ? 'Intégration indépendante · ' + (scenarios[run.scenario]?.[0] ?? run.scenario) : run.source === 'ARCHIVE' ? 'Campagne enregistrée' : scenarios[run.scenario]?.[0] ?? run.scenario;
const appOf = (report, run) => apps[run.application] ?? apps[report.serviceId] ?? report.serviceId ?? 'Application non précisée';
function describe() {
  $('description').textContent = scenarios[$('scenario').value]?.[1] ?? '';
  $('application-description').textContent = $('application').value === 'csv' ? 'Le client achète la conversion de ses données.' : 'Le client achète la génération du reçu, pas le paiement de la facture.';
  $('notice').textContent = $('source').value === 'SIMULATED' ? 'Aucun paiement : les montants et résultats affichés seront fictifs.' : 'Paiements sur Stellar Testnet, sans valeur réelle. La comparaison peut effectuer trois règlements. Arrêtez les serveurs de démonstration avant de lancer.';
}
function controls() {
  const disabled = pending || state.busy || !reachable;
  for (const id of ['launch', 'application', 'scenario', 'source']) $(id).disabled = disabled;
  $('launch').textContent = pending ? 'Démarrage…' : state.busy ? 'Expérience en cours…' : 'Voir ce qui arrive au client →';
}
function metric(value, label, note) {
  const n = el('div', undefined, 'metric'); n.append(el('span', label), el('strong', value)); if (note) n.append(el('small', note)); return n;
}
function technical(report, run) {
  const d = el('details', undefined, 'technical'); d.dataset.key = report.purchaseId;
  d.append(el('summary', 'Vérifier les preuves Stellar et les mesures'));
  d.append(el('p', `Verdict moteur : ${report.verdict} · Achat : ${report.purchaseId}`));
  d.append(el('p', `Prix : ${report.expectedAmountAtomic} unités atomiques. Montant observé : ${report.settledAmountAtomic}. Frais exclus.`));
  d.append(el('p', `Reprise mesurée par le serveur : ${run.source !== 'SIMULATED' && Number.isFinite(report.recoveryMs) ? report.recoveryMs + ' ms' : 'non mesurée'}. Observations inconnues : ${report.unknownObservations ?? 'non renseignées'}.`));
  for (const t of report.transfers) {
    const row = el('div', undefined, 'transfer');
    row.append(el('div', `Montant : ${t.amountAtomic} · Ledger : ${t.ledger}`), el('div', `Actif : ${t.tokenContract}`), el('div', `De : ${t.from}`), el('div', `Vers : ${t.to}`));
    if (run.source !== 'SIMULATED' && /^[a-f0-9]{64}$/i.test(t.txHash)) {
      const a = el('a', `Ouvrir la transaction ${t.txHash}`); a.href = `https://stellar.expert/explorer/testnet/tx/${t.txHash}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; row.append(a);
    } else row.append(el('div', t.txHash));
    d.append(row);
  }
  if (!report.transfers.length) d.append(el('p', 'Aucun transfert disponible. Cela ne prouve pas l’absence de paiement.'));
  return d;
}
function reportCard(report, run) {
  const simulated = run.source === 'SIMULATED';
  const overpaid = BigInt(report.settledAmountAtomic) > BigInt(report.expectedAmountAtomic);
  const paid = BigInt(report.settledAmountAtomic) > 0n;
  const label = report.verdict === 'PASS' ? 'Achat réussi' : report.verdict === 'UNKNOWN' ? 'Achat encore incertain' : report.verdict === 'UNSUPPORTED' ? 'Preuves non interprétables' : overpaid ? 'Le client a payé trop' : 'Achat non validé';
  const card = el('article', undefined, `panel report ${report.mode}`);
  card.append(el('p', appOf(report, run), 'eyebrow'), el('h3', report.mode === 'naive' ? 'Recommencer en payant' : 'Retrouver le même achat'), badge(`${simulated ? 'Fictif · ' : ''}${label}`, report.verdict));
  const count = new Set(report.transfers.map(t => t.txHash).filter(Boolean)).size;
  const metrics = el('div', undefined, 'metrics');
  metrics.append(metric(paid ? xlm(report.settledAmountAtomic) : 'Non établi', simulated ? 'Paiement fictif' : 'Paiement observé', `${count} règlement(s) ${simulated ? 'fictif(s)' : 'observé(s)'} · hors frais`));
  metrics.append(metric(report.responseRecovered ? 'Oui' : 'Pas confirmé', 'Résultat reçu ?', report.responseRecovered ? 'Réception confirmée par le client logiciel.' : 'Aucun accusé de réception disponible.'));
  const clientTime = Number.isFinite(report.recoveryDurationMs);
  const ms = clientTime ? report.recoveryDurationMs : report.recoveryMs;
  const measured = !simulated && Number.isFinite(ms);
  metrics.append(metric(measured ? `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} s` : 'Non mesuré', 'Temps de reprise', measured ? (clientTime ? 'Depuis l’interruption détectée par le client.' : 'Depuis l’interruption enregistrée par le serveur.') + ' Redémarrage inclus.' : 'Aucun délai complet disponible.'));
  card.append(metrics);
  let explanation = report.verdict === 'PASS' ? 'Un paiement attendu et un résultat reçu sont confirmés.' : overpaid ? `Le montant observé dépasse le prix de ${xlm((BigInt(report.settledAmountAtomic) - BigInt(report.expectedAmountAtomic)).toString())}.` : 'Les preuves disponibles ne permettent pas de confirmer un achat réussi.';
  if (report.mode === 'naive') explanation += ' Ce mode de démonstration crée volontairement une nouvelle autorisation de paiement.';
  if (simulated) explanation = 'Illustration fictive. ' + explanation;
  card.append(el('p', explanation, 'explanation'));
  const checkpoint = run.checkpoints?.find(c => c.purchaseId === report.purchaseId);
  if (checkpoint) card.append(el('p', `Avant reprise : ${checkpoint.verdict === 'UNKNOWN' ? 'état inconnu' : checkpoint.verdict}, réception ${checkpoint.responseRecovered ? 'confirmée' : 'non confirmée'}. Après : ${label.toLowerCase()}.`, 'checkpoint'));
  card.append(technical(report, run)); return card;
}
function render() {
  controls(); $('history').replaceChildren();
  if (!state.runs.length) $('history').append(el('p', 'Votre premier essai apparaîtra ici.', 'muted'));
  for (const run of state.runs) {
    const b = el('button', titleOf(run), `history-item ${selected === run.runId ? 'active' : ''}`);
    b.setAttribute('aria-pressed', String(selected === run.runId));
    b.append(el('small', `${run.source === 'ARCHIVE' ? 'Plusieurs achats' : apps[run.application] ?? 'Application non précisée'} · ${statusText[run.status]}`), el('small', sourceText[run.source]), el('small', new Date(run.startedAt).toLocaleString('fr-FR')));
    b.onclick = () => { selected = run.runId; render(); }; $('history').append(b);
  }
  const run = state.runs.find(r => r.runId === selected); if (!run) return;
  const detail = $('detail');
  const open = new Set([...detail.querySelectorAll('details[open]')].map(n => n.dataset.key));
  detail.replaceChildren();
  const heading = el('div', undefined, 'panel run-heading'); const title = el('div');
  title.append(badge(sourceText[run.source], run.source), el('h2', titleOf(run)), el('p', statusText[run.status]));
  if (run.source === 'ARCHIVE') title.append(el('p', 'Résultats enregistrés, sans nouvelle vérification réseau. Plusieurs achats peuvent provenir de scénarios différents.'));
  if (run.integrationEvidence) {
    const proof=run.integrationEvidence;
    title.append(el('p','API écrite par notre équipe, installée depuis une archive hors du dépôt. Validation technique ; aucun pilote client externe revendiqué.'));
    title.append(el('p',proof.package + ' · ' + proof.authorizationCount + ' autorisation(s) créée(s) · même autorisation réutilisée : ' + (proof.originalAuthorizationReused ? 'oui' : run.scenario === 'baseline' ? 'sans reprise à tester' : 'non')));
    title.append(el('p','Archive SHA-256 : ' + proof.archiveSha256));
  }
  if (run.source === 'SIMULATED') title.append(el('p', 'Ces résultats sont fictifs. Aucun paiement réseau.'));
  const download = el('a', '↓ Télécharger les preuves (JSON)'); download.href = `/api/runs/${encodeURIComponent(run.runId)}/export`; download.download = '';
  heading.append(title, download); detail.append(heading);
  if (run.status === 'RUNNING') detail.append(el('p', 'L’expérience est en cours. Attendez les preuves avant de conclure sur le paiement.', 'panel notice'));
  if (run.status === 'INTERRUPTED') detail.append(el('p', 'Exécution interrompue. Les achats sans rapport restent incertains. Conservez les autorisations pour la reprise.', 'panel notice'));
  if (run.scenario === 'comparison' && run.reports.length === 2) detail.append(el('p', 'Même panne, deux stratégies : comparez le montant payé et le résultat reçu. Les cartes correspondent à deux achats de démonstration distincts.', 'comparison-note'));
  const reports = el('div', undefined, 'reports');
  const ordered = run.scenario === 'comparison' ? [...run.reports].sort((a, b) => (a.mode === 'naive' ? 0 : 1) - (b.mode === 'naive' ? 0 : 1)) : run.reports;
  for (const report of ordered) reports.append(reportCard(report, run)); detail.append(reports);
  if (!run.reports.length) detail.append(el('div', 'Paiement : inconnu. Réception : non confirmée. Aucun rapport final disponible pour le moment.', 'panel empty'));
  const timeline = el('details', undefined, 'panel'); timeline.dataset.key = 'timeline'; timeline.append(el('summary', 'Voir le déroulement technique'));
  const list = el('ol', undefined, 'timeline'); for (const e of run.timeline) { const li = el('li'); li.append(el('time', new Date(e.at).toLocaleTimeString('fr-FR')), el('span', e.message)); list.append(li); } timeline.append(list); detail.append(timeline);
  for (const d of detail.querySelectorAll('details')) d.open = open.has(d.dataset.key);
  const announcement = `${titleOf(run)} : ${statusText[run.status]}, ${run.reports.length} rapport(s) disponible(s).`;
  if ($('announcement').textContent !== announcement) $('announcement').textContent = announcement;
}
async function refresh() {
  try {
    const response = await fetch('/api/state', { signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error();
    const next = await response.json(); reachable = true; $('connection').textContent = ''; controls();
    if (JSON.stringify(next) === previous) return;
    previous = JSON.stringify(next); state = next;
    if (!$('scenario').options.length) for (const [id, [label]] of Object.entries(scenarios)) if (state.scenarios.some(s => s.id === id)) { const o = el('option', label); o.value = id; $('scenario').append(o); }
    describe(); render();
  } catch { reachable = false; controls(); $('connection').textContent = 'Connexion au laboratoire interrompue. Les résultats affichés sont les derniers reçus ; nouvelle tentative automatique.'; }
}
for (const id of ['scenario', 'source', 'application']) $(id).onchange = describe;
$('launch').onclick = async () => {
  pending = true; controls(); $('error').textContent = '';
  try {
    const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ChaosPay-Local': '1' }, body: JSON.stringify({ scenario: $('scenario').value, source: $('source').value, application: $('application').value }), signal: AbortSignal.timeout(15000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Impossible de démarrer cette expérience.');
    selected = result.runId; previous = ''; await refresh(); $('balance-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { $('error').textContent = e.name === 'TimeoutError' ? 'Le démarrage n’a pas pu être confirmé. Vérifiez la liste des expériences avant de relancer.' : e.message; }
  finally { pending = false; controls(); }
};
await refresh(); setInterval(refresh, 2000);
