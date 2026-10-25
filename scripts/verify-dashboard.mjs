import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const url = 'http://127.0.0.1:3002';
try { await fetch(url+'/api/state', {signal:AbortSignal.timeout(500)}); throw new Error('Dashboard port already occupied'); }
catch(e) { if(e.message === 'Dashboard port already occupied') throw e; }
const child = spawn(process.execPath,['--import','tsx','packages/runner/src/server.ts'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
let output=''; child.stdout.on('data',x=>output+=x); child.stderr.on('data',x=>output+=x);
try {
  for(let i=0;i<60;i++) {
    if(child.exitCode!==null) throw new Error(output);
    if(await fetch(url+'/api/state').then(r=>r.ok,()=>false)) break;
    await delay(500);
  }
  const page=await fetch(url).then(r=>r.text()); assert.ok(page.includes('ChaosPay'));
  const state=await fetch(url+'/api/state').then(r=>r.json());
  const wanted=process.argv.slice(2);
  const ids=wanted.length?wanted:state.scenarios.map(s=>s.id);
  const results=[];
  for(const application of ['csv','receipt']) for(const scenario of ids) {
    const response=await fetch(url+'/api/runs',{method:'POST',headers:{'Content-Type':'application/json','X-ChaosPay-Local':'1'},body:JSON.stringify({scenario,source:'TESTNET',application})});
    assert.equal(response.status,202);
    const {runId}=await response.json();
    let run;
    for(let i=0;i<300;i++) {
      const current=await fetch(url+'/api/state').then(r=>r.json());
      run=current.runs.find(r=>r.runId===runId);
      if(run.status!=='RUNNING'&&!current.busy) break;
      await delay(1000);
    }
    assert.equal(run.status,'COMPLETE',JSON.stringify(run));
    assert.ok(run.reports.length);
    for(const r of run.reports) assert.equal(r.verdict,r.mode==='naive'?'FAIL':'PASS',JSON.stringify(r));
    if (!['baseline','concurrent'].includes(scenario)) {
      assert.ok(run.checkpoints.length);
      for (const checkpoint of run.checkpoints) assert.equal(checkpoint.verdict,'UNKNOWN');
      assert.ok(run.reports.every(r=>r.recoveryMs!==null && r.recoveryMs>=0));
      assert.ok(run.reports.every(r=>typeof r.recoveryDurationMs === "number" && r.recoveryDurationMs>=0));
    }
    if (scenario==='confirmation-lost') assert.ok(run.reports[0].unknownObservations>=1);
    const exported=await fetch(url+'/api/runs/'+runId+'/export').then(r=>r.json());
    assert.equal(exported.source,'TESTNET');
    assert.ok(!JSON.stringify(exported).includes('PAYMENT-SIGNATURE'));
    console.log(application+'/'+scenario+': '+run.reports.map(r=>r.mode+' '+r.verdict).join(', '));
    results.push(exported);
  }
  mkdirSync('.local',{recursive:true});
  writeFileSync('.local/dashboard-validation.json',JSON.stringify(results,null,2));
  mkdirSync('evidence/public',{recursive:true});
  writeFileSync('evidence/public/recovery-campaign.json',JSON.stringify({simulated:false,executedAt:new Date().toISOString(),runs:results,reports:Object.fromEntries(results.flatMap(run=>run.reports.map(r=>[r.purchaseId,r])))},null,2));
} finally {
  if(child.exitCode===null&&child.signalCode===null) {
    await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
  }
}
