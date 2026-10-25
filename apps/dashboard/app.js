const $ = id => document.getElementById(id);
let state = { scenarios: [], runs: [], busy: false }, selected, previous = '';
const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const badge = text => el('span', text, `badge ${text}`);
// Native XLM only in the MVP; preserve all seven decimal places without floating point conversion.
const xlm = atomic => { const n = BigInt(atomic); return `${n / 10000000n},${(n % 10000000n).toString().padStart(7, '0')} XLM`; };
function describe() {
  $('description').textContent = state.scenarios.find(s => s.id === $('scenario').value)?.description ?? '';
  $('notice').textContent = $('source').value === 'SIMULATED' ? 'Simulation : les transferts et verdicts sont fictifs.' : 'Exécution Testnet : configurez .env et arrêtez les serveurs manuels. Le runner démarre et arrête ses propres processus. La comparaison peut régler trois paiements de test.';
}
function render() {
  $('launch').disabled = state.busy;
  $('launch').textContent = state.busy ? 'Expérience en cours…' : 'Lancer l’expérience →';
  $('history').replaceChildren();
  for (const run of state.runs) {
    const b = el('button', state.scenarios.find(s => s.id === run.scenario)?.label ?? run.scenario, `history-item ${selected === run.runId ? 'active' : ''}`);
    b.append(el('small', `${run.source} · ${run.status}`), el('small', new Date(run.startedAt).toLocaleString('fr-FR')));
    b.onclick = () => { selected = run.runId; render(); };
    $('history').append(b);
  }
  const run = state.runs.find(r => r.runId === selected);
  if (!run) return;
  const detail = $('detail'); detail.replaceChildren();
  const heading = el('div', undefined, 'panel run-heading');
  const title = el('div'); title.append(badge(run.source), el('h3', (run.application ?? 'csv') + ' · ' + run.scenario), badge(run.status));
  if (run.source === 'SIMULATED') title.append(el('p', 'Données fictives — aucun paiement réseau.'));
  if (run.source === 'ARCHIVE') title.append(el('p', 'Preuves historiques du moteur A — non revérifiées en direct.'));
  const download = el('a', '↓ Export JSON expurgé'); download.href = `/api/runs/${encodeURIComponent(run.runId)}/export`; download.download = '';
  heading.append(title, download); detail.append(heading);
  const reports = el('div', undefined, 'reports');
  for (const report of run.reports) {
    const card = el('article', undefined, 'panel report');
    card.append(badge(report.verdict), el('h3', report.mode === 'durable' ? 'Reprise durable' : 'Fixture naïve'), el('p', report.purchaseId));
    const metrics = el('div', undefined, 'metrics');
    const settlements = new Set(report.transfers.map(t => t.txHash).filter(Boolean)).size;
    const duration = run.source === 'SIMULATED' ? 'Non mesuré' : Number.isFinite(report.recoveryDurationMs) ? `${(report.recoveryDurationMs / 1000).toFixed(3)} s` : 'Non mesuré';
    for (const [value, label] of [[settlements, 'Règlements observés (transactions uniques)'], [xlm(report.settledAmountAtomic), 'Montant payé observé · hors frais'], [xlm(report.expectedAmountAtomic), 'Prix de l’achat'], [report.responseRecovered ? 'Oui' : 'Non', 'Résultat récupéré et accusé'], [duration, 'Délai de reprise (runner)'], [report.recoveryMs == null ? 'Non mesuré' : report.recoveryMs + ' ms', 'Délai de reprise (moteur)'], [report.unknownObservations ?? 'Non mesuré', 'Observations inconnues']]) {
      const metric = el('div', undefined, 'metric'); metric.append(el('strong', String(value)), el('span', label)); metrics.append(metric);
    }
    card.append(metrics, el('p', report.reason));
    card.append(el('p', `Unités atomiques : ${report.settledAmountAtomic} payées / ${report.expectedAmountAtomic} attendues. Le délai couvre la détection de l’interruption jusqu’à l’accusé du résultat, redémarrage inclus.`));
    if (report.verdict === 'UNKNOWN') card.append(el('p', 'Observation incomplète : le montant observé ne permet pas de conclure à l’absence d’un paiement.'));
    for (const t of report.transfers) {
      const transfer = el('div', undefined, 'transfer');
      transfer.append(el('div', `Ledger ${t.ledger} · ${t.amountAtomic} unités`), el('div', `Actif : ${t.tokenContract}`), el('div', `De : ${t.from}`), el('div', `Vers : ${t.to}`));
      if (run.source !== 'SIMULATED' && /^[a-f0-9]{64}$/i.test(t.txHash)) {
        const a = el('a', t.txHash); a.href = `https://stellar.expert/explorer/testnet/tx/${t.txHash}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; transfer.append(a);
      } else transfer.append(el('div', t.txHash));
      card.append(transfer);
    }
    reports.append(card);
  }
  detail.append(reports);
  for (const checkpoint of run.checkpoints ?? []) detail.append(el('p', 'Avant reprise (' + checkpoint.mode + ') : ' + checkpoint.verdict + ' · résultat accusé : ' + (checkpoint.responseRecovered ? 'oui' : 'non')));
  if (!run.reports.length) detail.append(el('div', 'Aucune preuve disponible — verdict UNKNOWN.', 'panel empty'));
  const panel = el('section', undefined, 'panel'); panel.append(el('h2', 'Timeline'));
  const timeline = el('ol', undefined, 'timeline');
  for (const e of run.timeline) { const li = el('li'); li.append(el('time', new Date(e.at).toLocaleTimeString('fr-FR')), el('span', e.message)); timeline.append(li); }
  panel.append(timeline); detail.append(panel);
}
async function refresh() {
  try {
    const response = await fetch('/api/state'); if (!response.ok) throw new Error();
    const next = await response.json();
    if (JSON.stringify(next) === previous) return;
    previous = JSON.stringify(next); state = next;
    if (!$('scenario').options.length) for (const s of state.scenarios) { const option = el('option', s.label); option.value = s.id; $('scenario').append(option); }
    selected ??= state.runs[0]?.runId; describe(); render();
  } catch { $('error').textContent = 'Runner inaccessible. Vérifiez le terminal puis rechargez la page.'; }
}
$('scenario').onchange = describe; $('source').onchange = describe;
$('launch').onclick = async () => {
  $('launch').disabled = true; $('error').textContent = '';
  try {
    const r = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ChaosPay-Local': '1' }, body: JSON.stringify({ scenario: $('scenario').value, source: $('source').value, application: $('application').value }) });
    const result = await r.json(); if (!r.ok) throw new Error(result.error);
    selected = result.runId; await refresh();
  } catch (e) { $('error').textContent = e.message; }
  finally { $('launch').disabled = state.busy; }
};
await refresh(); setInterval(refresh, 1500);
