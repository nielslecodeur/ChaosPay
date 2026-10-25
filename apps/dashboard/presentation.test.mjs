import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// A minimal DOM for presentation logic checks; this does not replace a browser layout review.
class Element {
  constructor(tag = '') { this.tag = tag; this.children = []; this.dataset = {}; this.value = ''; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); if (this.tag === 'select' && !this.value) this.value = this.children[0]?.value; }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  scrollIntoView() {}
  get options() { return this.children; }
  querySelectorAll(selector) { return this.children.flatMap(n => [...(n.tag === 'details' && (selector !== 'details[open]' || n.open) ? [n] : []), ...n.querySelectorAll(selector)]); }
  get text() { return [this.textContent, ...this.children.map(n => n.text)].join(' '); }
}
const report = (change = {}) => ({ purchaseId: 'demo', serviceId: 'csv', mode: 'durable', verdict: 'PASS', expectedAmountAtomic: '100000', settledAmountAtomic: '100000', responseRecovered: true, recoveryMs: 1234, transfers: [{ txHash: 'a'.repeat(64), amountAtomic: '100000', tokenContract: 'token', from: 'buyer', to: 'merchant', ledger: 1 }], ...change });
const run = (change = {}) => ({ runId: 'run', application: 'csv', scenario: 'comparison', source: 'TESTNET', status: 'COMPLETE', startedAt: '2026-10-25T12:00:00Z', timeline: [], reports: [report()], ...change });
async function mount(current, options = {}) {
  const nodes = new Map();
  for (const id of ['application', 'scenario', 'source', 'launch', 'history', 'detail', 'announcement', 'application-description', 'description', 'notice', 'connection', 'error', 'balance-title']) nodes.set(id, new Element(['application', 'scenario', 'source'].includes(id) ? 'select' : 'div'));
  nodes.get('application').value = 'receipt'; nodes.get('source').value = 'SIMULATED';
  const calls = []; let poll;
  const context = {
    document: { getElementById: id => nodes.get(id), createElement: tag => new Element(tag) }, AbortSignal,
    setInterval: callback => { poll = callback; },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (options.offline) throw new Error('offline');
      if (url === '/api/runs') return { ok: true, json: async () => current };
      return { ok: true, json: async () => ({ scenarios: [{ id: 'comparison' }], runs: [current], busy: options.busy ?? false }) };
    },
  };
  await runInNewContext(`(async () => { ${readFileSync(new URL('./app.js', import.meta.url), 'utf8')} })()`, context);
  nodes.get('history').children[0]?.onclick();
  return { nodes, calls, poll };
}
test('UNKNOWN with no transfer never claims no payment or successful receipt', async () => {
  const { nodes } = await mount(run({ reports: [report({ verdict: 'UNKNOWN', settledAmountAtomic: '0', responseRecovered: false, transfers: [], recoveryMs: null })] }));
  const text = nodes.get('detail').text;
  assert.match(text, /Achat encore incertain/); assert.match(text, /Non établi/); assert.match(text, /Pas confirmé/); assert.match(text, /Non mesuré/);
  assert.doesNotMatch(text, /Achat réussi/);
});
test('comparison shows overpayment first and distinguishes receipt from success', async () => {
  const { nodes } = await mount(run({ reports: [report(), report({ mode: 'naive', verdict: 'FAIL', settledAmountAtomic: '200000', transfers: [report().transfers[0], { ...report().transfers[0], txHash: 'b'.repeat(64) }] })] }));
  const text = nodes.get('detail').text;
  assert.ok(text.indexOf('Recommencer en payant') < text.indexOf('Retrouver le même achat'));
  assert.match(text, /0,0200000 XLM/); assert.match(text, /Le client a payé trop/); assert.match(text, /deux achats/);
});
test('simulation remains fictitious and never displays a measured duration or explorer link', async () => {
  const { nodes } = await mount(run({ source: 'SIMULATED' }));
  const text = nodes.get('detail').text;
  assert.match(text, /SIMULATION/); assert.match(text, /Paiement fictif/); assert.match(text, /Non mesuré/);
  assert.doesNotMatch(text, /Ouvrir la transaction/);
});
test('archive identifies historical provenance and uses the server duration explicitly', async () => {
  const { nodes } = await mount(run({ source: 'ARCHIVE', application: undefined, reports: [report({ serviceId: 'receipt' })] }));
  assert.match(nodes.get('detail').text, /Génération de reçus/);
  assert.match(nodes.get('detail').text, /sans nouvelle vérification/);
  assert.match(nodes.get('detail').text, /enregistrée par le serveur/);
});
test('launch preserves the existing runner contract and selected application', async () => {
  const { nodes, calls } = await mount(run({ source: 'SIMULATED' }));
  await nodes.get('launch').onclick();
  const post = calls.find(c => c.url === '/api/runs');
  assert.deepEqual(JSON.parse(post.init.body), { scenario: 'comparison', source: 'SIMULATED', application: 'receipt' });
  assert.equal(post.init.headers['X-ChaosPay-Local'], '1');
});
test('busy and disconnected states disable launching another run', async () => {
  const busy = await mount(run(), { busy: true }); assert.equal(busy.nodes.get('launch').disabled, true);
  const offline = await mount(run(), { offline: true }); assert.equal(offline.nodes.get('launch').disabled, true);
  assert.match(offline.nodes.get('connection').text, /Connexion au laboratoire interrompue/);
});
