import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "../apps/demo-merchant/src/config.js";

const c = config();
const children: ChildProcess[] = [];
const prefix = "verify-" + Date.now();
const reports: Record<string, unknown> = {};
function start(file: string) {
  const child = spawn(process.execPath,["--import","tsx","--env-file=.env",file],{ stdio: ["ignore","pipe","pipe"], windowsHide: true });
  children.push(child);
  return child;
}
async function ready(url: string, child: ChildProcess) {
  for (let i=0; i<60; i++) {
    if (child.exitCode !== null) throw new Error("Server exited before readiness.");
    try { if ((await fetch(url + "/health",{ signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await delay(500);
  }
  throw new Error("Server did not become ready.");
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || child.killed) return;
  const done = new Promise<void>(resolve => child.once("exit",() => resolve()));
  child.kill();
  await done;
}
async function smoke(id: string, mode: string, fault: string, extra: string[] = [], expectedCode = 0) {
  const child = spawn(process.execPath,["--import","tsx","--env-file=.env","scripts/smoke-payment.ts",id,mode,fault,...extra],{ stdio: ["ignore","pipe","pipe"], windowsHide: true });
  children.push(child);
  let output = "";
  child.stdout!.on("data",chunk => { output += chunk; });
  child.stderr!.on("data",chunk => { output += chunk; });
  const code = await new Promise<number | null>(resolve => child.once("exit",resolve));
  if (code !== expectedCode) throw new Error("Smoke test failed (" + id + ", code " + code + "): " + output);
  console.log(id + ": expected client exit " + code);
}
async function report(id: string, mode: string) {
  const r = await fetch(c.merchantUrl + "/reports/" + id + "?mode=" + mode).then(r => r.json()) as { verdict: string; settledAmountAtomic: string; transfers: unknown[]; responseRecovered: boolean };
  reports[id] = r;
  return r;
}
for (const url of [c.merchantUrl,c.facilitatorUrl]) {
  try { await fetch(url + "/health",{ signal: AbortSignal.timeout(500) }); throw new Error("Port already in use: stop existing demo servers before verification."); }
  catch (e) { if (e instanceof Error && e.message.startsWith("Port already")) throw e; }
}
try {
  const f = start("apps/demo-merchant/src/facilitator.ts"); await ready(c.facilitatorUrl,f);
  let m = start("apps/demo-merchant/src/server.ts"); await ready(c.merchantUrl,m);
  const drop = prefix + "-drop";
  await smoke(drop,"durable","drop",[],2);
  await stop(m);
  m = start("apps/demo-merchant/src/server.ts"); await ready(c.merchantUrl,m);
  await smoke(drop,"durable","none");
  const recovered = await report(drop,"durable");
  assert.equal(recovered.verdict,"PASS"); assert.equal(recovered.transfers.length,1);
  const crash = prefix + "-crash";
  await smoke(crash,"durable","crash",[],2);
  if (m.exitCode === null) await new Promise(resolve => m.once("exit",resolve));
  m = start("apps/demo-merchant/src/server.ts"); await ready(c.merchantUrl,m);
  await smoke(crash,"durable","none");
  assert.equal((await report(crash,"durable")).verdict,"PASS");
  const concurrent = prefix + "-concurrent";
  await smoke(concurrent,"durable","none",["--concurrent"]);
  const simultaneous = await report(concurrent,"durable");
  assert.equal(simultaneous.verdict,"PASS"); assert.equal(simultaneous.transfers.length,1);
  const naive = prefix + "-naive";
  await smoke(naive,"naive","drop",[],2);
  await smoke(naive,"naive","none",["--new-authorization"]);
  const duplicated = await report(naive,"naive");
  assert.equal(duplicated.verdict,"FAIL");
  assert.equal(duplicated.settledAmountAtomic,(BigInt(c.amount)*2n).toString());
  // Restart facilitator too, then recover an existing authorization without settling again.
  await stop(m); await stop(f);
  const f2 = start("apps/demo-merchant/src/facilitator.ts"); await ready(c.facilitatorUrl,f2);
  m = start("apps/demo-merchant/src/server.ts"); await ready(c.merchantUrl,m);
  await smoke(crash,"durable","none");
  assert.equal((await report(crash,"durable")).transfers.length,1);
  mkdirSync("evidence/public",{ recursive: true });
  const evidence = { executedAt: new Date().toISOString(), network: "stellar:testnet", simulated: false, reports };
  const filename = "evidence/public/" + prefix + ".json";
  writeFileSync(filename,JSON.stringify(evidence,null,2) + "\n");
  console.log("All live Testnet assertions passed. Evidence: " + filename);
} finally {
  for (const child of children.reverse()) await stop(child);
}
