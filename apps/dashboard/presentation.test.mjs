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
  assert.match(text, /Purchase unresolved/); assert.match(text, /Not established/); assert.match(text, /Not confirmed/); assert.match(text, /Not measured/);
  assert.doesNotMatch(text, /Purchase succeeded/);
});
test('comparison shows overpayment first and distinguishes receipt from success', async () => {
  const { nodes } = await mount(run({ reports: [report(), report({ mode: 'naive', verdict: 'FAIL', settledAmountAtomic: '200000', transfers: [report().transfers[0], { ...report().transfers[0], txHash: 'b'.repeat(64) }] })] }));
  const text = nodes.get('detail').text;
  assert.ok(text.indexOf('Pay again on retry') < text.indexOf('Recover the same purchase'));
  assert.match(text, /0\.0200000 XLM/); assert.match(text, /Customer overpaid/); assert.match(text, /two separate demo purchases/);
});
test('simulation remains fictitious and never displays a measured duration or explorer link', async () => {
  const { nodes } = await mount(run({ source: 'SIMULATED' }));
  const text = nodes.get('detail').text;
  assert.match(text, /SIMULATION/); assert.match(text, /Fictional payment/); assert.match(text, /Not measured/);
  assert.doesNotMatch(text, /Open transaction/);
});
test('archive identifies historical provenance and uses the server duration explicitly', async () => {
  const { nodes } = await mount(run({ source: 'ARCHIVE', application: undefined, reports: [report({ serviceId: 'receipt' })] }));
  assert.match(nodes.get('detail').text, /Receipt generation/);
  assert.match(nodes.get('detail').text, /no new network verification/);
  assert.match(nodes.get('detail').text, /Since the server recorded the interruption/);
});
test('package integration archive identifies the third API without claiming an external pilot', async () => {
  const { nodes } = await mount(run({ source: 'ARCHIVE', application: undefined, reports: [report({ serviceId: 'invoice-check' })] }));
  assert.match(nodes.get('detail').text, /Independent package integration/);
  assert.match(nodes.get('detail').text, /not been piloted by an external customer/);
  assert.match(nodes.get('detail').text, /campaign runs separately/);
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
  assert.match(offline.nodes.get('connection').text, /Connection to the lab lost/);
});

test('Lumaid signal mark is present in the header and browser tab', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const logo = readFileSync(new URL('./lumaid-mark.svg', import.meta.url), 'utf8');
  assert.match(html, /rel="icon"[^>]*href="\/lumaid-mark\.svg\?v=9"/);
  assert.equal((html.match(/src="\/lumaid-mark\.svg\?v=9"/g) ?? []).length, 1);
  assert.match(html, /class="brand-mark"/);
  assert.doesNotMatch(html, /class="home-mark"/);
  assert.match(logo, /<svg[^>]*viewBox="0 0 64 64"/);
  assert.match(logo, /M30 5v35a8 8 0 0 0 8 8h22/);
  assert.equal((logo.match(/stroke="#A7FFE4"/g) ?? []).length, 1);
  assert.doesNotMatch(logo, /linearGradient|url\(#|<circle|<polygon/);
});

test('installation provides Windows, Linux, and macOS tabs with platform-specific commands', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.match(html, /id="tab-windows"[^>]*aria-selected="true"/);
  assert.match(html, /id="panel-windows"[^>]*role="tabpanel"/);
  assert.match(html, /id="panel-linux"[^>]*role="tabpanel"[^>]*hidden/);
  assert.match(html, /id="panel-macos"[^>]*role="tabpanel"[^>]*hidden/);
  assert.match(html, /winget install --id OpenJS\.NodeJS\.LTS --exact/);
  assert.equal((html.match(/class="install-command"/g) ?? []).length, 10);
  assert.equal((html.match(/class="copy-button"/g) ?? []).length, 10);
  assert.equal((html.match(/aria-label="Copy command" title="Copy command"/g) ?? []).length, 10);
  assert.equal((html.match(/<svg aria-hidden="true" viewBox="0 0 20 20"><rect/g) ?? []).length, 10);
  assert.match(css, /\.doc pre\.install-command\{display:grid;grid-template-columns:minmax\(0,1fr\) 28px/);
  assert.match(css, /\.doc pre\.install-command code\{[^}]*white-space:pre-wrap/);
  assert.match(html, /git clone https:\/\/github\.com\/nielslecodeur\/Lumaid\.git/);
});

test('installation tabs switch panels and support keyboard navigation', () => {
  const script = readFileSync(new URL('./copy-commands.js', import.meta.url), 'utf8');
  const tabs = ['windows', 'linux', 'macos'].map((name, index) => {
    const attributes = { 'aria-controls': `panel-${name}`, 'aria-selected': String(index === 0), tabindex: index === 0 ? '0' : '-1' };
    const listeners = {};
    return {
      name,
      attributes,
      listeners,
      getAttribute: key => attributes[key],
      setAttribute: (key, value) => { attributes[key] = value; },
      addEventListener: (event, handler) => { listeners[event] = handler; },
      focus: () => { focused = name; },
    };
  });
  const panels = Object.fromEntries(tabs.map((tab, index) => [tab.attributes['aria-controls'], { hidden: index !== 0 }]));
  let focused = '';
  const context = {
    document: {
      querySelectorAll: selector => selector === '[role="tab"]' ? tabs : [],
      getElementById: id => panels[id],
    },
  };
  runInNewContext(script, context);

  tabs[1].listeners.click();
  assert.equal(tabs[1].attributes['aria-selected'], 'true');
  assert.equal(panels['panel-linux'].hidden, false);
  assert.equal(panels['panel-windows'].hidden, true);

  let prevented = false;
  tabs[1].listeners.keydown({ key: 'ArrowRight', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(tabs[2].attributes['aria-selected'], 'true');
  assert.equal(panels['panel-macos'].hidden, false);
  assert.equal(focused, 'macos');
});

test('copy buttons copy commands and announce clipboard failures', async () => {
  const script = readFileSync(new URL('./copy-commands.js', import.meta.url), 'utf8');
  const code = { textContent: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash' };
  const status = { textContent: '' };
  const block = { querySelector: selector => selector === 'code' ? code : status };
  let click;
  let timer;
  let copied;
  const attributes = {};
  const button = {
    closest: () => block,
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (_event, handler) => { click = handler; },
  };
  const context = {
    document: { querySelectorAll: selector => selector === '[role="tab"]' ? [] : [button] },
    navigator: { clipboard: { writeText: async text => { copied = text; } } },
    window: { setTimeout: callback => { timer = callback; } },
  };

  runInNewContext(script, context);
  await click();
  assert.equal(copied, 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash');
  assert.equal(attributes['aria-label'], 'Copied');
  assert.equal(status.textContent, 'Command copied to clipboard.');
  timer();
  assert.equal(attributes['aria-label'], 'Copy command');

  code.textContent = 'npm ci\nnpm run setup:testnet';
  await click();
  assert.equal(copied, 'npm ci\nnpm run setup:testnet');

  context.navigator.clipboard.writeText = async () => { throw new Error('permission denied'); };
  await click();
  assert.equal(attributes['aria-label'], 'Copy failed');
  assert.match(status.textContent, /Select and copy the command manually/);
});
