import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// A minimal DOM for presentation logic checks; this does not replace a browser layout review.
class Element {
  constructor(tag = '') { this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.value = ''; this.textContent = ''; this.open = false; }
  append(...nodes) { this.children.push(...nodes); if (this.tag === 'select' && !this.value) this.value = this.children[0]?.value; }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.close?.(); }
  focus() {}
  scrollIntoView() {}
  get options() { return this.children; }
  querySelectorAll(selector) { return this.children.flatMap(n => [...(n.tag === 'details' && (selector !== 'details[open]' || n.open) ? [n] : []), ...n.querySelectorAll(selector)]); }
  get text() { return [this.textContent, ...this.children.map(n => n.text)].join(' '); }
}
const report = (change = {}) => ({ purchaseId: 'demo', serviceId: 'csv', mode: 'durable', verdict: 'PASS', expectedAmountAtomic: '100000', settledAmountAtomic: '100000', responseRecovered: true, recoveryMs: 1234, transfers: [{ txHash: 'a'.repeat(64), amountAtomic: '100000', tokenContract: 'token', from: 'buyer', to: 'merchant', ledger: 1 }], ...change });
const run = (change = {}) => ({ runId: 'run', application: 'csv', scenario: 'comparison', source: 'TESTNET', status: 'COMPLETE', startedAt: '2026-10-25T12:00:00Z', timeline: [], reports: [report()], ...change });
const testContract = `C${'A'.repeat(55)}`;
const descendants = node => [node, ...(node.children ?? []).flatMap(descendants)];
async function mount(current, options = {}) {
  const nodes = new Map();
  for (const id of ['application', 'scenario', 'source', 'history-filter', 'launch', 'history', 'detail', 'announcement', 'application-description', 'description', 'source-description', 'notice', 'connection', 'error', 'balance-title', 'testnet-confirmation', 'testnet-confirmation-summary', 'confirm-testnet', 'cancel-testnet']) nodes.set(id, new Element(['application', 'scenario', 'source', 'history-filter'].includes(id) ? 'select' : 'div'));
  nodes.get('application').value = 'receipt';
  for (const value of ['csv', 'receipt', 'market-quote', 'web-research', 'delivery-status', 'weather-brief']) {
    nodes.get('application').children.push({ value, disabled: false });
  }
  nodes.get('source').value = 'SIMULATED';
  nodes.get('history-filter').value = 'ALL';
  const calls = []; let poll;
  const context = {
    LUMAID_SERVER: options.remoteServer === true,
    document: { getElementById: id => nodes.get(id), createElement: tag => new Element(tag) }, AbortSignal,
    location: { hostname: options.hostname ?? (options.hosted ? 'lumaid.example' : '127.0.0.1'), port: options.hosted ? '' : '3002' },
    setInterval: callback => { poll = callback; },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (options.offline) throw new Error('offline');
      if (url === '/api/runs') return { ok: true, json: async () => current };
      return { ok: true, json: async () => ({ scenarios: [{ id: 'comparison' }], runs: options.runs ?? [current], busy: options.busy ?? false }) };
    },
  };
  await runInNewContext(`(async () => { ${readFileSync(new URL('./app.js', import.meta.url), 'utf8')} })()`, context);
  nodes.get('history').children[0]?.onclick?.();
  return { nodes, calls, poll };
}
test('UNKNOWN with no transfer is clearly uncertain and recommends safe follow-up', async () => {
  const { nodes } = await mount(run({ reports: [report({ verdict: 'UNKNOWN', settledAmountAtomic: '0', responseRecovered: false, transfers: [], recoveryMs: null })] }));
  const text = nodes.get('detail').text;
  assert.match(text, /Payment status unknown/); assert.match(text, /Do not create a new payment yet/); assert.match(text, /Not established/); assert.match(text, /Not confirmed/); assert.match(text, /Not measured/);
  assert.doesNotMatch(text, /Payment confirmed/);
});
test('all payment verdicts have explicit, non-color-only labels', async () => {
  const labels = {
    PASS: /Payment evidence Payment confirmed/,
    FAIL: /Payment evidence Payment not verified/,
    UNKNOWN: /Payment evidence Payment status unknown/,
    UNSUPPORTED: /Payment evidence Evidence unsupported/,
  };
  for (const [verdict, label] of Object.entries(labels)) {
    const { nodes } = await mount(run({ reports: [report({ verdict })] }));
    assert.match(nodes.get('detail').text, label, verdict);
  }
});
test('unknown evidence offers next steps appropriate to simulation and archive provenance', async () => {
  const unknown = report({ verdict: 'UNKNOWN', settledAmountAtomic: '0', transfers: [] });
  const simulated = await mount(run({ source: 'SIMULATED', reports: [unknown] }));
  assert.match(simulated.nodes.get('detail').text, /fictional result does not establish any real payment state/);
  assert.doesNotMatch(simulated.nodes.get('detail').text, /Check the facilitator/);

  const archive = await mount(run({ source: 'ARCHIVE', reports: [unknown] }));
  assert.match(archive.nodes.get('detail').text, /historical snapshot, not the current payment status/);
  assert.doesNotMatch(archive.nodes.get('detail').text, /Do not create a new payment yet/);
});
test('run completion is labeled separately from payment evidence', async () => {
  for (const [status, label] of Object.entries({
    RUNNING: 'Experiment running',
    COMPLETE: 'Experiment finished',
    INTERRUPTED: 'Experiment interrupted',
  })) {
    const { nodes } = await mount(run({ status }));
    assert.match(nodes.get('detail').text, new RegExp(label), status);
  }
});
test('plain-language report summary explains the service, payment, result, and recovery', async () => {
  const { nodes } = await mount(run({
    source: 'SIMULATED',
    scenario: 'drop',
    application: 'receipt',
  }));
  const text = nodes.get('detail').text;
  assert.match(text, /What happened/);
  assert.match(text, /agent requested a service to generate a JSON receipt/);
  assert.match(text, /0\.0100000 XLM is fictional; no real payment was sent/);
  assert.match(text, /simulation marks it as received; no real service was called/);
  assert.match(text, /Simulation: the original purchase was retried instead of creating a new authorization/);
  assert.match(text, /invoice itself is not paid/);
});
test('pre-submit failure summary explains automatic retry without suggesting on-chain cancellation', async () => {
  const { nodes } = await mount(run({
    scenario: 'before-submit',
    source: 'TESTNET',
  }));
  const text = nodes.get('detail').text;
  assert.match(text, /Bug before settlement · automatic retry/);
  assert.match(text, /error happened before payment submission/);
  assert.match(text, /same signed authorization automatically/);
  assert.doesNotMatch(text, /transaction was cancelled on Stellar/);
});
test('documentation distinguishes pre-submit retry from an on-chain cancellation and bot integration', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /Nothing is cancelled on-chain/);
  assert.match(html, /A confirmed on-chain transaction cannot be cancelled/);
  assert.match(html, /bot\/client must persist.*retry with those same values/s);
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
test('Testnet launch requires confirmation; cancellation never submits a run', async () => {
  const { nodes, calls } = await mount(run());
  nodes.get('source').value = 'TESTNET';
  nodes.get('source').onchange();
  nodes.get('launch').onclick();
  assert.equal(nodes.get('testnet-confirmation').open, true);
  assert.match(nodes.get('testnet-confirmation-summary').text, /up to 3 settlements using 0\.01 test XLM each/);
  assert.equal(calls.some(call => call.url === '/api/runs'), false);
  let prevented = false;
  nodes.get('testnet-confirmation').listeners.keydown({ key: 'Escape', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(nodes.get('testnet-confirmation').open, false);
  nodes.get('testnet-confirmation').showModal();
  nodes.get('testnet-confirmation').listeners.cancel({ preventDefault: () => { prevented = true; } });
  assert.equal(nodes.get('testnet-confirmation').open, false);
  assert.equal(calls.some(call => call.url === '/api/runs'), false);
});
test('only explicit Testnet confirmation submits the selected experiment', async () => {
  const { nodes, calls } = await mount(run());
  nodes.get('source').value = 'TESTNET';
  nodes.get('source').onchange();
  nodes.get('launch').onclick();
  await nodes.get('confirm-testnet').onclick();
  const posts = calls.filter(call => call.url === '/api/runs');
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(posts[0].init.body), { scenario: 'comparison', source: 'TESTNET', application: 'receipt' });
});
test('history source filter hides runs from other modes', async () => {
  const simulated = run({ runId: 'simulation', source: 'SIMULATED' });
  const testnet = run({ runId: 'testnet', source: 'TESTNET' });
  const { nodes } = await mount(testnet, { runs: [testnet, simulated] });
  assert.equal(nodes.get('history').children.length, 2);
  nodes.get('history-filter').value = 'SIMULATED';
  nodes.get('history-filter').onchange();
  assert.equal(nodes.get('history').children.length, 1);
  assert.match(nodes.get('history').text, /SIMULATION/);
  assert.doesNotMatch(nodes.get('history').text, /TESTNET/);
});
test('Testnet results link valid token contracts to Stellar Expert, never simulated contracts', async () => {
  const testnetReport = report({
    tokenContract: testContract,
    transfers: [{ ...report().transfers[0], tokenContract: testContract }],
  });
  const testnet = await mount(run({ reports: [testnetReport] }));
  const link = descendants(testnet.nodes.get('detail')).find(node => node.tag === 'a' && node.href?.includes('/contract/'));
  assert.ok(link);
  assert.equal(link.href, `https://stellar.expert/explorer/testnet/contract/${testContract}`);
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');

  const simulated = await mount(run({ source: 'SIMULATED', reports: [testnetReport] }));
  assert.doesNotMatch(simulated.nodes.get('detail').text, /Stellar Expert/);
});
test('changing run mode updates Testnet safety guidance and launch action', async () => {
  const { nodes } = await mount(run());
  const source = nodes.get('source');
  source.value = 'TESTNET';
  source.onchange();
  assert.match(nodes.get('notice').text, /Stellar Testnet only/);
  assert.match(nodes.get('notice').text, /three test payments/);
  assert.equal(nodes.get('notice').className, 'notice notice-testnet');
  assert.match(nodes.get('launch').textContent, /Run Testnet experiment/);
  assert.match(nodes.get('source-description').textContent, /real Stellar Testnet transactions/);
  const explorer = nodes.get('notice').children.find(node => node.tag === 'a');
  assert.equal(explorer.href, 'https://stellar.expert/explorer/testnet');

  source.value = 'SIMULATED';
  source.onchange();
  assert.match(nodes.get('notice').text, /no payment is made/);
  assert.match(nodes.get('source-description').textContent, /Fictional amounts and results/);
  assert.equal(nodes.get('launch').textContent, 'Run simulation →');
});
test('Testnet chooses an integrated service while agent examples remain selectable', async () => {
  const { nodes } = await mount(run());
  const application = nodes.get('application');
  application.value = 'web-research';
  nodes.get('source').value = 'TESTNET';
  nodes.get('source').onchange();
  assert.equal(application.value, 'csv');
  assert.equal(application.children.find(option => option.value === 'csv').disabled, false);
  assert.equal(application.children.find(option => option.value === 'receipt').disabled, false);
  for (const value of ['market-quote', 'web-research', 'delivery-status', 'weather-brief']) {
    assert.equal(application.children.find(option => option.value === value).disabled, false);
  }
  assert.match(nodes.get('application-description').textContent, /Testnet currently supports CSV conversion, JSON receipts and the local invoice agent/);
});
test('busy and disconnected states disable launching another run', async () => {
  const busy = await mount(run(), { busy: true }); assert.equal(busy.nodes.get('launch').disabled, true);
  const offline = await mount(run(), { offline: true }); assert.equal(offline.nodes.get('launch').disabled, true);
  assert.match(offline.nodes.get('connection').text, /Connection to the lab lost/);
});

test('public static page does not poll the local lab API', async () => {
  const { calls, poll } = await mount(run(), { hosted: true });
  assert.deepEqual(calls, []);
  assert.equal(poll, undefined);
});

test('local lab keeps polling when opened through localhost', async () => {
  const { calls, poll } = await mount(run(), { hostname: 'localhost' });
  assert.ok(calls.some(call => call.url === '/api/state'));
  assert.equal(typeof poll, 'function');
});

test('no-install browser demo renders fictional outcomes without network requests', async () => {
  const script = readFileSync(new URL('./quick-demo.js', import.meta.url), 'utf8');
  const node = () => ({
    children: [],
    textContent: '',
    className: '',
    classList: { remove() {} },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    get text() { return [this.textContent, ...this.children.map(child => child.text)].join(' '); },
  });
  const scenario = { value: 'lost-response', addEventListener() {} };
  const useCase = { value: 'market-quote' };
  const result = node();
  let run;
  const runButton = { addEventListener: (_event, callback) => { run = callback; } };
  const nodes = new Map([['quick-scenario', scenario], ['quick-usecase', useCase], ['quick-run', runButton], ['quick-result', result]]);
  const context = {
    document: { getElementById: id => nodes.get(id), createElement: node },
    fetch: () => { throw new Error('The browser demo must not call an API.'); },
  };

  runInNewContext(script, context);
  run();
  assert.match(result.text, /Simulation complete — no payment was made/);
  assert.match(result.text, /Naive retry/);
  assert.match(result.text, /Recover the same purchase/);
  assert.match(result.text, /0\.0200000 XLM/);
  assert.match(result.text, /0\.0100000 XLM/);
  assert.match(result.text, /without creating another settlement/);
  assert.match(result.text, /sample XLM\/EUR quote/);
  assert.match(result.text, /2 fictional settlement/);
  assert.match(result.text, /not paid for twice/);

  scenario.value = 'normal';
  useCase.value = 'delivery-status';
  run();
  assert.match(result.text, /Normal purchase/);
  assert.match(result.text, /fictional parcel/);
  assert.match(result.text, /fictional delivery update/);
  assert.doesNotMatch(result.text, /Naive retry/);
});

test('quick demo labels extra agent use cases as fictional and keeps Testnet scope clear', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(html, /id="quick-usecase"/);
  assert.match(html, /An XLM\/EUR quote · sample data/);
  assert.match(html, /A parcel delivery update · fictional parcel/);
  assert.match(html, /none of these examples calls a real service/);
  assert.match(html, /online Testnet lab below runs a scripted invoice purchase/);
});

test('local service selector offers useful simulation-only agent examples', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  assert.match(html, /<title>Lumaid — Your payment never failed<\/title>/);
  for (const id of ['market-quote', 'web-research', 'delivery-status', 'weather-brief']) {
    assert.match(html, new RegExp(`<option value="${id}">`));
    assert.match(app, new RegExp(`'${id}':`));
  }
  assert.match(html, /Agent examples · simulation only/);
});

test('Lumaid signal mark is present in the header and browser tab', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const logo = readFileSync(new URL('./lumaid-mark.svg', import.meta.url), 'utf8');
  assert.match(html, /rel="icon"[^>]*href="\.\/lumaid-mark\.svg\?v=9"/);
  assert.equal((html.match(/src="\.\/lumaid-mark\.svg\?v=9"/g) ?? []).length, 1);
  assert.match(html, /class="brand-mark"/);
  assert.doesNotMatch(html, /class="home-mark"/);
  assert.match(html, /href="#try">Explore the demo/);
  assert.match(html, /id="nav-try">Demo/);
  assert.doesNotMatch(html, /id="nav-demo"|id="demo"/);
  assert.match(html, /<div id="try" hidden>[\s\S]*?<section id="local-lab"/);
  assert.match(html, /h==="#try"\|\|localLab\?"try":"home"/);
  assert.match(html, /localLab=h==="#local-lab"\|\|h==="#demo"/);
  assert.match(html, /if\(localLab\)document\.getElementById\("local-lab"\)\.scrollIntoView/);
  assert.match(html, /href="#local-lab">Continue to the Testnet lab/);
  assert.match(readFileSync(new URL('./app.js', import.meta.url), 'utf8'), /location\.hash = 'try'/);
  assert.match(logo, /<svg[^>]*viewBox="0 0 64 64"/);
  assert.match(logo, /M30 5v35a8 8 0 0 0 8 8h22/);
  assert.equal((logo.match(/stroke="#A7FFE4"/g) ?? []).length, 1);
  assert.doesNotMatch(logo, /linearGradient|url\(#|<circle|<polygon/);
});

test('landing page uses the deep-space visual direction from the reference', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('./space-scene.svg', import.meta.url), 'utf8');
  assert.match(html, /class="cosmic-scene"[^>]*aria-hidden="true"/);
  assert.match(html, /class="cosmic-scene"/);
  assert.match(css, /space-scene\.svg/);
  assert.match(css, /--paper:#080d1b/);
  assert.match(css, /\.home-view \.home-copy\{[^}]*align-items:center/);
  assert.match(css, /\.home-view \.home-cta\{[^}]*background:#fff0df/);
  assert.match(app, /rgba\(255, 147, 124/);
  assert.match(app, /length: 360/);
  assert.match(app, /starTints = \['255,239,225', '196,210,255', '255,194,178'\]/);
  assert.match(scene, /nebula-coral/);
  assert.match(scene, /nebula-violet/);
  assert.ok((scene.match(/<circle cx=/g) ?? []).length >= 70);
  assert.match(scene, /<circle cx="235" cy="1010" r="465" fill="url\(#planet\)"\/>\s*<g class="spin-world">/);
  const spinningWorld = scene.match(/<g class="spin-world">([\s\S]*?)<\/g>/)?.[1] ?? '';
  assert.ok(spinningWorld);
  assert.doesNotMatch(spinningWorld, /fill="url\(#planet\)"/);
});

test('landing page restores the astronaut cursor and previous hero treatment', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  assert.match(html, /id="astronaut-cursor"[^>]*aria-hidden="true"/);
  assert.match(html, /src="\.\/astronaut\.svg"/);
  assert.match(html, /Your payment never failed\./);
  assert.match(app, /astronautCursor\.style\.transform = `translate3d/);
  assert.match(app, /astronautCursor\.classList\.add\('is-visible'\)/);
  assert.match(app, /!document\.body\.classList\.contains\('home-view'\)/);
  assert.match(css, /#astronaut-cursor\{[^}]*pointer-events:none/);
  assert.match(css, /body\.home-view #astronaut-cursor\{display:block\}/);
  assert.match(css, /\.home-view \.home-secondary\{display:none\}/);
  assert.match(css, /\.home-view \.home-route,\.home-view \.home-proof\{display:none\}/);
  assert.match(html, /class="home-route"[^>]*aria-label="Payment journey/);
});

test('navigation stays right-aligned and space animations respect reduced motion', () => {
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('./space-scene.svg', import.meta.url), 'utf8');
  assert.match(css, /header nav\{[^}]*margin:0 0 0 auto/);
  assert.match(css, /body:not\(\.home-view\) header \.brand-mark\{display:none\}/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*?header nav\{margin:0 0 0 auto\}/);
  assert.doesNotMatch(css, /header nav\{[^}]*margin-right:auto;margin-left:40px/);
  assert.match(scene, /\.spin-world\{transform-origin:/);
  assert.match(scene, /\.spin-moon\{transform-origin:/);
  assert.match(scene, /\.star-dots circle\{[^}]*animation:twinkle/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?animation-duration:\.01ms!important/);
  assert.match(app, /star\.sparkle/);
  assert.match(app, /prefers-reduced-motion: reduce/);
});

test('installation provides Windows, Linux, and macOS tabs with platform-specific commands', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.match(html, /id="tab-windows"[^>]*aria-selected="true"/);
  assert.match(html, /id="panel-windows"[^>]*role="tabpanel"/);
  assert.match(html, /id="panel-linux"[^>]*role="tabpanel"[^>]*hidden/);
  assert.match(html, /id="panel-macos"[^>]*role="tabpanel"[^>]*hidden/);
  assert.match(html, /<h1>Use Lumaid on your computer<\/h1>[\s\S]*?<a class="home-cta install-demo-link" href="#try">Open the instant demo/);
  assert.match(html, /<details class="install-advanced">[\s\S]*?<summary>Set up the local lab \(optional\)<\/summary>/);
  assert.match(html, /Lancer-Lumaid\.cmd/);
  assert.equal((html.match(/class="install-command"/g) ?? []).length, 8);
  assert.equal((html.match(/class="copy-button"/g) ?? []).length, 8);
  assert.match(html, /aria-orientation="horizontal"/);
  assert.match(html, /class="copy-button" type="button" aria-label="Copy command" title="Copy command"/);
  assert.equal((html.match(/<svg aria-hidden="true" viewBox="0 0 20 20"><rect/g) ?? []).length, 8);
  assert.match(css, /\.doc pre\.install-command\{grid-template-columns:minmax\(0,1fr\) 36px/);
  assert.match(css, /\.doc pre\.install-command code\{[^}]*white-space:pre-wrap/);
  assert.match(html, /git clone https:\/\/github\.com\/nielslecodeur\/Lumaid\.git/);
  assert.equal(packageJson.scripts.quickstart, 'npm ci && npm run dev:dashboard');
  assert.equal((html.match(/npm run quickstart/g) ?? []).length, 2);
  assert.match(html, /select Simulation\. This path requires no Testnet setup and makes no payment/);
  assert.match(css, /\.docs-layout\.install-layout\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test('hosted browser demo uses relative assets and hides local Testnet controls', () => {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
  assert.match(html, /href="\.\/style\.css"/);
  assert.match(html, /src="\.\/app\.js"/);
  assert.match(html, /src="\.\/quick-demo\.js"/);
  assert.match(html, /localServer=\["127\.0\.0\.1","localhost"\]\.includes\(location\.hostname\)/);
  assert.doesNotMatch(html, /if\(localLab&&!localServer\)location\.hash="try"/);
  assert.match(css, /\.home-view \.cosmic-scene\{[^}]*url\("\.\/space-scene\.svg"\)/);
  assert.doesNotMatch(css, /\.hosted-demo \.local-lab-section[^}]*display:none/);
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-demo.yml', import.meta.url), 'utf8');
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path: apps\/dashboard/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
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

  prevented = false;
  tabs[2].listeners.keydown({ key: 'ArrowDown', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(tabs[2].attributes['aria-selected'], 'true');
});

test('copy buttons copy commands and announce clipboard failures', async () => {
  const script = readFileSync(new URL('./copy-commands.js', import.meta.url), 'utf8');
  const code = { textContent: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash' };
  const status = { textContent: '' };
  const block = { querySelector: selector => selector === 'code' ? code : status };
  const panel = { querySelector: () => ({ textContent: 'Linux setup' }) };
  block.closest = () => panel;
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
  assert.match(attributes['aria-label'], /^Copied: Linux setup command 1:/);
  assert.equal(status.textContent, 'Command copied to clipboard.');
  timer();
  assert.match(attributes['aria-label'], /^Copy Linux setup command 1:/);

  code.textContent = 'npm ci\nnpm run setup:testnet';
  await click();
  assert.equal(copied, 'npm ci\nnpm run setup:testnet');

  context.navigator.clipboard.writeText = async () => { throw new Error('permission denied'); };
  await click();
  assert.match(attributes['aria-label'], /^Copy failed: Linux setup command 1:/);
  assert.match(status.textContent, /Select and copy the command manually/);
});

 test('hosted lab runs simulations without requests and enables standalone Testnet', async () => {
 const {nodes,calls}=await mount(run(),{hosted:true});
 assert.equal(nodes.get('launch').disabled,false);
 await nodes.get('launch').onclick();
 assert.match(nodes.get('detail').text,/SIMULATION/);
 assert.equal(calls.length,0);
 nodes.get('source').value='TESTNET';nodes.get('source').onchange();
 assert.equal(nodes.get('launch').disabled,false);
 assert.match(nodes.get('connection').textContent,/without a local server/);
 });

test('selecting an agent in Testnet switches to simulation without refresh', async () => {
 for (const hosted of [true,false]) {
 const {nodes}=await mount(run(),{hosted});
 for(const value of ['web-research','market-quote','delivery-status','weather-brief']) {
 nodes.get('source').value='TESTNET';nodes.get('source').onchange();
 nodes.get('application').value=value;nodes.get('application').onchange();
 assert.equal(nodes.get('application').value,value);
 assert.equal(nodes.get('source').value,'SIMULATED');
 assert.equal(nodes.get('launch').disabled,false);
 assert.match(nodes.get('application-description').textContent,/Switched to Simulation/);
 }
 }
});

test('invoice agent selects Testnet and limits supported failures',async()=>{
 const {nodes}=await mount(run());
 nodes.get('application').value='invoice-agent';nodes.get('application').onchange();
 assert.equal(nodes.get('source').value,'TESTNET');
 assert.equal(nodes.get('scenario').value,'drop');
 assert.match(nodes.get('application-description').textContent,/Ollama/);
 nodes.get('application').value='web-research';nodes.get('application').onchange();
 assert.equal(nodes.get('source').value,'SIMULATED');
});

test('remote runner and static browser both enable their own Testnet modes',async()=>{
 const remote=await mount(run(),{hosted:true,remoteServer:true});
 assert.ok(remote.calls.some(c=>c.url==='/api/state'));
 remote.nodes.get('source').value='TESTNET';remote.nodes.get('source').onchange();
 assert.equal(remote.nodes.get('launch').disabled,false);
 const page=await mount(run(),{hosted:true});
 page.nodes.get('source').value='TESTNET';page.nodes.get('source').onchange();
 assert.equal(page.nodes.get('launch').disabled,false);
 assert.equal(page.calls.length,0);
});
