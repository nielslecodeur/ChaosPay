// Standalone educational demo. Not the server recovery package or an x402 merchant.
export const JOURNAL_KEY = 'lumaid.browser-testnet.v1';
const HORIZON = 'https://horizon-testnet.stellar.org';
export function createBrowserDemo({ sdk, storage, fetcher = fetch, progress = () => {} }) {
  const read = () => JSON.parse(storage.getItem(JOURNAL_KEY) || 'null');
  const save = entry => storage.setItem(JOURNAL_KEY, JSON.stringify(entry));
  async function request(url, init = {}) {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Testnet service returned HTTP ${response.status}. Keep this journal and retry recovery.`);
    return response.json();
  }
  async function recover() {
    const entry = read();
    if (!entry) throw new Error('No saved purchase in this browser.');
    progress('Checking the saved transaction hash. No signature or payment is requested.');
    const tx = await request(`${HORIZON}/transactions/${entry.hash}`);
    const payment = sdk.TransactionBuilder.fromXDR(tx.envelope_xdr, sdk.Networks.TESTNET);
    const op = payment.operations[0];
    if (tx.hash !== entry.hash || !tx.successful || payment.hash().toString('hex') !== entry.hash ||
        payment.source !== entry.buyer || payment.operations.length !== 1 || op.type !== 'payment' ||
        op.destination !== entry.seller || op.amount !== '0.0100000' || !op.asset.isNative()) {
      throw new Error('The ledger does not confirm the expected payment. No replacement payment will be created.');
    }
    entry.status = 'RECOVERED';
    entry.ledger = tx.ledger;
    // Reconstruct a deterministic local receipt, not a remotely stored business result.
    entry.result = { purchaseId: entry.id, invoice: 'DEMO-001', subtotal: 20, tax: 4, total: 24, arithmeticValid: true, payment: entry.hash };
    save(entry);
    return entry;
  }
  async function start(scenario) {
    if (read()) throw new Error('A purchase is already saved. Recover it before explicitly starting a new purchase.');
    if (!['baseline', 'drop'].includes(scenario)) throw new Error('Browser Testnet supports normal purchase and lost response only.');
    // Verify durable storage before any funding or payment. Private keys only live in memory.
    storage.setItem(JOURNAL_KEY + '.probe', 'ok'); storage.removeItem(JOURNAL_KEY + '.probe');
    const buyer = sdk.Keypair.random(), seller = sdk.Keypair.random();
    progress('Funding two temporary Testnet accounts with Friendbot. This may take a minute.');
    await request(`https://friendbot.stellar.org/?addr=${buyer.publicKey()}`);
    await request(`https://friendbot.stellar.org/?addr=${seller.publicKey()}`);
    const account = await request(`${HORIZON}/accounts/${buyer.publicKey()}`);
    const tx = new sdk.TransactionBuilder(new sdk.Account(buyer.publicKey(), account.sequence), {
      fee: '10000', networkPassphrase: sdk.Networks.TESTNET,
    }).addOperation(sdk.Operation.payment({ destination: seller.publicKey(), asset: sdk.Asset.native(), amount: '0.01' })).setTimeout(180).build();
    tx.sign(buyer);
    const entry = { version: 1, id: crypto.randomUUID(), hash: tx.hash().toString('hex'), buyer: buyer.publicKey(), seller: seller.publicKey(), scenario, status: 'UNKNOWN', startedAt: new Date().toISOString() };
    // Write-ahead journal: even if submission times out or the tab closes, recovery is read-only.
    save(entry);
    progress('Journal saved. Submitting one payment of 0.01 test XLM.');
    await request(`${HORIZON}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tx: tx.toXDR() }).toString() });
    if (scenario === 'drop') {
      entry.status = 'RESPONSE_LOST'; save(entry); return entry;
    }
    return recover();
  }
  return { read, start, recover };
}
