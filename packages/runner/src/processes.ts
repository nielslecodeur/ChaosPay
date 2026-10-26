import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export class Processes {
  private children = new Map<string, ChildProcess>();
  async start(name: 'merchant' | 'facilitator', url: string, application: 'csv' | 'receipt' | 'invoice-agent' = 'csv', env: Record<string, string> = {}) {
    const existing = this.children.get(name);
    if (existing && existing.exitCode === null && existing.signalCode === null) return;
    const occupied = await fetch(url + '/health', { signal: AbortSignal.timeout(700) }).then(() => true, () => false);
    if (occupied) throw new Error('Port already occupied');
    const file = name === 'merchant' ? 'server' : 'facilitator';
    const entry = name === 'merchant' && application === 'invoice-agent' ? 'apps/invoice-agent-api/server.ts' : name === 'merchant' && application === 'receipt' ? 'apps/receipt-api/src/server.ts' : `apps/demo-merchant/src/${file}.ts`;
    const child = spawn(process.execPath, ['--import', 'tsx', '--env-file=.env', entry], { stdio: 'ignore', windowsHide: true, env: { ...process.env, ...env } });
    let failed = false;
    child.on('error', () => { failed = true; });
    this.children.set(name, child);
    for (let i = 0; i < 60; i++) {
      if (failed || child.exitCode !== null || child.signalCode !== null) throw new Error('Process startup failed');
      if (await fetch(url + '/health', { signal: AbortSignal.timeout(800) }).then(r => r.ok, () => false)) return;
      await delay(500);
    }
    throw new Error('Readiness timeout');
  }
  async stop(name: string) {
    const child = this.children.get(name);
    if (!child) return;
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Process stop timeout')), 10000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill();
      });
    }
    this.children.delete(name);
  }
  async close() { await this.stop('merchant'); await this.stop('facilitator'); }
}
