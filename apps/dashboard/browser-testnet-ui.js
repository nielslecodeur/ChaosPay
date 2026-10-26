import { createBrowserDemo, JOURNAL_KEY } from './browser-testnet.js';
const panel = document.getElementById('browser-testnet');
const output = document.getElementById('browser-testnet-output');
const recoverButton = document.getElementById('browser-recover');
const resetButton = document.getElementById('browser-new');
let demo;
function getDemo() {
  if (!globalThis.StellarSdk) throw new Error('Stellar SDK could not load. Reload the page before trying again.');
  return demo ??= createBrowserDemo({ sdk: globalThis.StellarSdk, storage: localStorage, progress: message => { output.textContent = message; } });
}
function show(entry) {
  output.textContent = entry.status === 'RECOVERED'
    ? `Payment verified in ledger ${entry.ledger}. One transaction of 0.01 test XLM. Recovery requests no new authorization.\nLocal receipt: ${JSON.stringify(entry.result, null, 2)}`
    : `${entry.status}: ${entry.status === 'RESPONSE_LOST' ? 'Payment submitted; the application response was deliberately discarded.' : 'Payment outcome is not established.'} Click Recover saved purchase, including after refreshing this page. Do not pay again.`;
  const link = document.getElementById('browser-transaction');
  link.href = `https://stellar.expert/explorer/testnet/tx/${entry.hash}`;
  link.textContent = `View transaction ${entry.hash}`;
  recoverButton.disabled = false;
  resetButton.disabled = entry.status !== 'RECOVERED';
}
async function execute(action) {
  panel.hidden = false; panel.scrollIntoView({ block: 'start' });
  recoverButton.disabled = resetButton.disabled = true;
  try {
    if (!navigator.locks) throw new Error('Use a browser supporting Web Locks over HTTPS for safe multi-tab coordination.');
    await navigator.locks.request('lumaid-browser-payment', { ifAvailable: true }, async lock => {
      if (!lock) throw new Error('Another tab is processing this demo. Wait for it to finish.');
      const engine = getDemo();
      show(await action(engine));
    });
  } catch (error) {
    output.textContent = `${error.message}\nIf a transaction was saved, use recovery. An unavailable confirmation does not mean the payment failed.`;
    try { recoverButton.disabled = !getDemo().read(); } catch {}
  }
}
globalThis.runBrowserTestnet = scenario => execute(engine => engine.read() ? engine.recover() : engine.start(scenario));
recoverButton.onclick = () => execute(engine => engine.recover());
resetButton.onclick = () => execute(async engine => {
  const entry = engine.read();
  if (entry?.status !== 'RECOVERED') throw new Error('Recover the saved purchase before starting another.');
  // Preserve the previous proof before removing the active journal.
  localStorage.setItem(`${JOURNAL_KEY}.archive.${entry.id}`, JSON.stringify(entry));
  localStorage.removeItem(JOURNAL_KEY);
  output.textContent = 'Previous proof archived in this browser. Select a scenario and confirm a new purchase.';
  return entry;
}).then(() => { if (!getDemo().read()) { output.textContent = 'Previous proof archived. You may now confirm a new purchase.'; recoverButton.disabled = resetButton.disabled = true; } });
try { const entry = getDemo().read(); if (entry) { panel.hidden = false; show(entry); } } catch (error) { output.textContent = error.message; }
