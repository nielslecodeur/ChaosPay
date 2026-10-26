import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const answer = (purchaseId, status, reasonCode, extra = {}) => ({ purchaseId, status, reasonCode, ...extra });

// No model or merchant implementation imports. Signing is injected only into purchase().
export class InvoiceClient {
  constructor({ database, baseUrl, recipient, asset, maxAmount = '100000', maxPurchases = 1, fetcher = fetch }) {
    const base = new URL(baseUrl);
    if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || base.username || base.password || base.search || base.hash) throw Error('Local API URL required');
    if (!/^[1-9]\d*$/.test(maxAmount) || !Number.isSafeInteger(maxPurchases) || maxPurchases < 1) throw Error('Invalid budget');
    this.policy = { baseUrl: base.href.replace(/\/$/, ''), recipient, asset, maxAmount, maxPurchases };
    this.fetch = fetcher;
    mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(database);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS purchases(id TEXT PRIMARY KEY, body TEXT NOT NULL, policy TEXT NOT NULL, payload TEXT, result TEXT)');
  }
  close() { this.db.close(); }
  get(id) { return this.db.prepare('SELECT * FROM purchases WHERE id=?').get(id); }
  url(id, kind = 'purchases') { return `${this.policy.baseUrl}/${kind}/${id}?mode=durable`; }
  async call(url, body, payload, fault) {
    return this.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(180000),
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'PAYMENT-SIGNATURE': Buffer.from(JSON.stringify(payload)).toString('base64') } : {}), ...(fault ? { 'X-Chaos-Fault': fault } : {}) } });
  }
  async purchase(id, body, authorize, { fault = 'none' } = {}) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !['none','drop'].includes(fault)) throw Error('Invalid purchase or fault');
    if (!body?.invoice || JSON.stringify(body).length > 32000) throw Error('Invalid invoice');
    let existing = this.get(id);
    if (existing) {
      if (existing.body !== JSON.stringify(body)) return answer(id, 'BLOCKED', 'INTENT_MISMATCH');
      return this.recover(id);
    }
    // Claim before signing; an interrupted claim is deliberately blocked, never signed again.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      existing = this.get(id);
      if (!existing) {
        const { count } = this.db.prepare('SELECT COUNT(*) AS count FROM purchases').get();
        if (count >= this.policy.maxPurchases) throw Error('Purchase budget exhausted');
        this.db.prepare('INSERT INTO purchases(id,body,policy) VALUES(?,?,?)').run(id, JSON.stringify(body), JSON.stringify(this.policy));
      }
      this.db.exec('COMMIT');
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    if (existing) {
      if (existing.body !== JSON.stringify(body)) return answer(id, 'BLOCKED', 'INTENT_MISMATCH');
      return this.recover(id);
    }
    try {
      const response = await this.call(this.url(id), body);
      if (response.status !== 402) return answer(id, 'BLOCKED', 'CHALLENGE_UNAVAILABLE');
      const challenge = await response.json(), terms = challenge.accepts?.[0];
      if (challenge.x402Version !== 2 || challenge.resource?.url !== this.url(id) || challenge.accepts?.length !== 1 ||
          terms.scheme !== 'exact' || terms.network !== 'stellar:testnet' || terms.asset !== this.policy.asset || terms.payTo !== this.policy.recipient ||
          !/^[1-9]\d*$/.test(terms.amount) || BigInt(terms.amount) > BigInt(this.policy.maxAmount)) return answer(id, 'BLOCKED', 'TERMS_REJECTED');
      const payload = await authorize(challenge);
      if (payload.resource?.url !== this.url(id) || hash(payload.accepted) !== hash(terms)) return answer(id, 'BLOCKED', 'AUTHORIZATION_MISMATCH');
      this.db.prepare('UPDATE purchases SET payload=? WHERE id=?').run(JSON.stringify(payload), id);
      return this.send(id, fault);
    } catch { return answer(id, 'PENDING', 'INTERRUPTED_CHECK_JOURNAL'); }
  }
  async recover(id) {
    const row = this.get(id);
    if (!row) return answer(id, 'BLOCKED', 'LOCAL_PURCHASE_MISSING');
    if (row.policy !== JSON.stringify(this.policy)) return answer(id, 'BLOCKED', 'POLICY_CHANGED');
    if (!row.payload) return answer(id, 'BLOCKED', 'AUTHORIZATION_NOT_SAVED');
    try {
      const response = await this.call(this.url(id, 'reports'));
      if (response.status === 404) return answer(id, 'BLOCKED', 'MERCHANT_JOURNAL_MISSING');
      if (response.status !== 200) return answer(id, 'PENDING', 'REPORT_UNAVAILABLE');
      const report = await response.json();
      if (!this.validReport(id, report)) return answer(id, 'BLOCKED', 'INVALID_REPORT');
      if (['FAIL','UNSUPPORTED'].includes(report.verdict)) return answer(id, 'BLOCKED', report.verdict);
      return this.send(id, 'none');
    } catch { return answer(id, 'PENDING', 'SERVICE_UNAVAILABLE'); }
  }
  validReport(id, r) {
    const payload = JSON.parse(this.get(id).payload);
    return r?.schemaVersion === 1 && r.purchaseId === id && r.mode === 'durable' && r.network === 'stellar:testnet' &&
      r.tokenContract === this.policy.asset && r.expectedAmountAtomic === payload.accepted.amount &&
      ['PASS','FAIL','UNKNOWN','UNSUPPORTED'].includes(r.verdict) && typeof r.responseRecovered === 'boolean' &&
      typeof r.settledAmountAtomic === 'string' && /^\d+$/.test(r.settledAmountAtomic) && Array.isArray(r.transfers) &&
      r.transfers.every(t => typeof t.txHash === 'string' && /^[a-f0-9]{64}$/i.test(t.txHash) &&
        typeof t.from === 'string' && typeof t.to === 'string' && typeof t.tokenContract === 'string' &&
        typeof t.amountAtomic === 'string' && /^\d+$/.test(t.amountAtomic) && Number.isSafeInteger(t.ledger));
  }
  async send(id, fault) {
    const row = this.get(id), payload = JSON.parse(row.payload);
    try {
      const response = await this.call(this.url(id), JSON.parse(row.body), payload, fault);
      if (response.status !== 200) return answer(id, response.status === 202 ? 'PENDING' : 'BLOCKED', `HTTP_${response.status}`);
      const output = await response.json();
      if (!Object.hasOwn(output, 'result') || hash(output.result) !== output.resultHash || !/^[a-f0-9]{64}$/i.test(output.txHash)) return answer(id, 'BLOCKED', 'RESULT_INTEGRITY');
      this.db.prepare('UPDATE purchases SET result=? WHERE id=?').run(JSON.stringify(output), id);
      const ack = await this.call(`${this.policy.baseUrl}/purchases/${id}/ack?mode=durable`, { resultHash: output.resultHash }, payload);
      if (ack.status !== 200) return answer(id, 'PENDING', 'ACK_UNCONFIRMED');
      const r = await this.call(this.url(id, 'reports'));
      if (r.status !== 200) return answer(id, 'PENDING', 'REPORT_UNAVAILABLE');
      const report = await r.json();
      if (!this.validReport(id, report)) return answer(id, 'BLOCKED', 'INVALID_REPORT');
      const t = report.transfers[0];
      if (report.verdict === 'PASS' && report.responseRecovered && report.transfers.length === 1 &&
          t.txHash === output.txHash && t.to === this.policy.recipient && t.tokenContract === this.policy.asset &&
          t.amountAtomic === payload.accepted.amount && report.settledAmountAtomic === payload.accepted.amount) {
        return answer(id, 'COMPLETED', 'RECOVERED', { result: output.result, evidence: report });
      }
      return answer(id, report.verdict === 'FAIL' || report.verdict === 'UNSUPPORTED' ? 'BLOCKED' : 'PENDING', 'PAYMENT_EVIDENCE_INCOMPLETE');
    } catch { return answer(id, 'PENDING', 'INTERRUPTED'); }
  }
}
