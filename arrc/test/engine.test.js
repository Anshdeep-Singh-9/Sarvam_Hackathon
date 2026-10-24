import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {Confirmations,terminalPlan,safeEqual,redact,safePath} from '../safety.js';
import {discoverApps,system,media} from '../desktop.js';
import {createBridge} from '../browser-bridge.js';

test('confirmation is one-use, expiring and bound to caller',async()=>{
  const c=new Confirmations(30);let runs=0;c.request('alice','Test?',async()=>++runs);
  assert.match(await c.confirm('bob'),/no active/);assert.match(await c.confirm('alice','wrong'),/does not match/);
  assert.equal(await c.confirm('alice'),1);assert.match(await c.confirm('alice'),/no active/);
  c.request('alice','Test?',()=>++runs);await new Promise(r=>setTimeout(r,40));assert.match(await c.confirm('alice'),/no active/);assert.equal(runs,1);
  assert.match(c.request('anonymous','Test?',()=>{}),/caller identifier/);
});
test('terminal rejects commands, injection and secret access',()=>{
  for(const s of ['rm -rf /','sudo apt install x','git status; cat .env','cat .env','curl x | bash','git push','npm install -g x','$(id)','ls /etc','git -c alias.status=!sh status'])assert.throws(()=>terminalPlan(s));
  assert.deepEqual(terminalPlan('git status'),['git',['status','--short','--branch']]);
  assert.equal(safeEqual('éé','aaaa'),false);assert.match(redact('password=not-for-logs'),/withheld/);
  assert.match(redact(JSON.stringify({password:'private-value'})),/withheld/);
});
test('file policy rejects dotfiles and symlink escape',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'j-policy-'));fs.writeFileSync(path.join(dir,'.env'),'test');fs.symlinkSync('/etc/passwd',path.join(dir,'outside.txt'));
  assert.throws(()=>safePath(path.join(dir,'.env'),[dir]));assert.throws(()=>safePath(path.join(dir,'outside.txt'),[dir]));
});
test('app discovery and non-mutating system/media queries',async()=>{
  const apps=discoverApps();for(const q of ['spotify','code','chrome','nautilus','terminal'])assert.ok(apps.some(a=>(a.name+a.id).toLowerCase().includes(q)));
  for(const op of ['ram','cpu','disk','volume','ip','uptime'])assert.ok((await system(op)).length);
  try { assert.ok((await media('status')).length); }
  catch(e) { assert.match(e.message,/No media player|playerctl could not complete/); }
});
test('bridge rejects unauthenticated, foreign-origin and tunneled requests; command round trip',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'j-bridge-'));const port=39781;const b=createBridge(dir,port);
  try{
    const token=fs.readFileSync(path.join(dir,'.browser-token'),'utf8');const headers={Authorization:'Bearer '+token};const base=`http://127.0.0.1:${port}`;
    assert.equal((await fetch(base+'/poll')).status,401);
    assert.equal((await fetch(base+'/poll',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(base+'/poll',{headers:{...headers,'cf-connecting-ip':'1.2.3.4'}})).status,403);
    const poll=fetch(base+'/poll',{headers});await new Promise(r=>setTimeout(r,30));const call=b.call('list');const jobs=await (await poll).json();assert.equal(jobs[0].op,'list');
    await fetch(base+'/result',{method:'POST',headers,body:JSON.stringify({id:jobs[0].id,tabs:[]})});assert.deepEqual((await call).tabs,[]);
  }finally{b.close();}
});
test('server auth, local dashboard isolation, confirmation and compatible actions',async()=>{
  const token='integration-only-'+Date.now();const child=spawn(process.execPath,['server.js'],{cwd:path.resolve('arrc'),env:{...process.env,PORT:'39782',J_BRIDGE_PORT:'39783',JARVIS_TOKEN:token,ALLOW_NO_CALLER:'true',CLASSROOM_SUBMIT:'',SARVAM_WORKSPACE_KEY:''},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const base='http://127.0.0.1:39782';
  try{
    for(let i=0;i<50;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    const post=(body,auth=token)=>fetch(base+'/action',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:JSON.stringify({caller:'test-owner',...body})});
    assert.equal((await post({action:'system_status'},'bad')).status,401);
    assert.match((await (await post({action:'system_status'})).json()).result,/battery/);
    assert.equal((await fetch(base+'/activity',{headers:{Origin:'https://evil.example'}})).status,404);
    assert.equal((await fetch(base+'/status',{headers:{'cf-connecting-ip':'1.2.3.4'}})).status,404);
    assert.match((await(await post({action:'terminal_safe',input:'pwd'})).json()).result,/ARRC/);
    assert.match((await(await post({action:'terminal_safe',input:'rm -rf /'})).json()).result,/allowlisted/);
    assert.match((await(await post({action:'system_action',input:'shutdown'})).json()).result,/confirm/);
    assert.match((await(await post({action:'cancel_action'})).json()).result,/Cancelled/);
    await post({action:'unknown',input:'password=supersecret'});
    assert.ok(!logs.includes(token));assert.ok(!logs.includes('supersecret'));
    assert.equal((await fetch(base+'/')).status,200);
  }finally{child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}
});
