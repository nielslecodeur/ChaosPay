import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Purchase {
  key: string; purchaseId: string; mode: "durable" | "naive"; bodyHash: string;
  authDigest: string; buyer: string; txHash: string; state: string; result: string | null; deliveries: number;
  interruptedAt: number | null; acknowledgedAt: number | null; unknownObservations: number;
}
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS purchases (
        key TEXT PRIMARY KEY, purchaseId TEXT NOT NULL, mode TEXT NOT NULL,
        bodyHash TEXT NOT NULL, authDigest TEXT NOT NULL UNIQUE, buyer TEXT NOT NULL,
        txHash TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'PREPARED',
        result TEXT, deliveries INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS settlements (
        digest TEXT PRIMARY KEY, payer TEXT NOT NULL, txHash TEXT NOT NULL DEFAULT '', result TEXT);
    `);
    const columns = this.db.prepare("PRAGMA table_info(purchases)").all().map(c => c.name);
    for (const [name,type] of [["interruptedAt","INTEGER"],["acknowledgedAt","INTEGER"],["unknownObservations","INTEGER NOT NULL DEFAULT 0"]]) {
      if (!columns.includes(name!)) this.db.exec("ALTER TABLE purchases ADD COLUMN " + name + " " + type);
    }
  }
  migrateLegacyCsv() {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const rows = this.db.prepare("SELECT key,result FROM purchases WHERE key LIKE 'durable:%' OR key LIKE 'naive:%'").all() as unknown as {key:string;result:string|null}[];
      for (const row of rows) this.db.prepare("UPDATE purchases SET key=?,result=? WHERE key=?").run("csv:"+row.key,row.result === null ? null : JSON.stringify(row.result),row.key);
      this.db.exec("COMMIT");
    } catch(e) {this.db.exec("ROLLBACK"); throw e;}
  }
  get(key: string) { return this.db.prepare("SELECT * FROM purchases WHERE key=?").get(key) as Purchase | undefined; }
  list(id: string, mode: string) { return this.db.prepare("SELECT * FROM purchases WHERE purchaseId=? AND mode=?").all(id, mode) as unknown as Purchase[]; }
  insert(p: Pick<Purchase, "key" | "purchaseId" | "mode" | "bodyHash" | "authDigest" | "buyer">) {
    this.db.prepare("INSERT INTO purchases(key,purchaseId,mode,bodyHash,authDigest,buyer,state) VALUES(?,?,?,?,?,?,'PREPARED')")
      .run(p.key,p.purchaseId,p.mode,p.bodyHash,p.authDigest,p.buyer);
  }
  claimSubmission(key: string) {
    return this.db.prepare("UPDATE purchases SET state='SUBMITTING' WHERE key=? AND state='PREPARED'").run(key).changes === 1;
  }
  update(key: string, state: string, txHash: string, result: string | null) {
    this.db.prepare("UPDATE purchases SET state=?,txHash=?,result=? WHERE key=?").run(state,txHash,result,key);
  }
  interrupted(key: string) {
    this.db.prepare("UPDATE purchases SET interruptedAt=COALESCE(interruptedAt,?) WHERE key=?").run(Date.now(),key);
  }
  unknown(key: string) {
    this.interrupted(key);
    this.db.prepare("UPDATE purchases SET unknownObservations=unknownObservations+1 WHERE key=?").run(key);
  }
  delivered(key: string) {
    this.db.prepare("UPDATE purchases SET deliveries=1,acknowledgedAt=COALESCE(acknowledgedAt,?) WHERE key=?").run(Date.now(),key);
  }
  close() { this.db.close(); }
}
export class Queue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn,fn);
    this.tail = next.catch(() => {});
    return next;
  }
}
