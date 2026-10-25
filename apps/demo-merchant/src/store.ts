import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Purchase {
  key: string; purchaseId: string; mode: "durable" | "naive"; bodyHash: string;
  authDigest: string; buyer: string; txHash: string; state: string; result: string | null; deliveries: number;
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
        txHash TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'SUBMITTING',
        result TEXT, deliveries INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS settlements (
        digest TEXT PRIMARY KEY, payer TEXT NOT NULL, txHash TEXT NOT NULL DEFAULT '', result TEXT);
    `);
  }
  get(key: string) { return this.db.prepare("SELECT * FROM purchases WHERE key=?").get(key) as Purchase | undefined; }
  list(id: string, mode: string) { return this.db.prepare("SELECT * FROM purchases WHERE purchaseId=? AND mode=?").all(id, mode) as unknown as Purchase[]; }
  insert(p: Pick<Purchase, "key" | "purchaseId" | "mode" | "bodyHash" | "authDigest" | "buyer">) {
    this.db.prepare("INSERT INTO purchases(key,purchaseId,mode,bodyHash,authDigest,buyer) VALUES(?,?,?,?,?,?)")
      .run(p.key,p.purchaseId,p.mode,p.bodyHash,p.authDigest,p.buyer);
  }
  update(key: string, state: string, txHash: string, result: string | null) {
    this.db.prepare("UPDATE purchases SET state=?,txHash=?,result=? WHERE key=?").run(state,txHash,result,key);
  }
  delivered(key: string) { this.db.prepare("UPDATE purchases SET deliveries=1 WHERE key=?").run(key); }
  close() { this.db.close(); }
}
// Keeps operations sequential, including after a rejected promise.
export class Queue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn,fn);
    this.tail = next.catch(() => {});
    return next;
  }
}
