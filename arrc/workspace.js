import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {safePath,terminalPlan,redact} from './safety.js';
import {command,launch} from './desktop.js';
const HOME=os.homedir();
export const roots=['Documents','Projects','Desktop','Downloads','Pictures'].map(x=>path.join(HOME,x)).filter(fs.existsSync).map(p=>fs.realpathSync(p));
const skip=new Set(['node_modules','venv','dist','build','target','vendor']);
let cache=[],at=0;
export function index(){
  if(Date.now()-at<60000)return cache;
  const out=[];
  const walk=(dir,depth)=>{if(depth>5||out.length>18000)return;let es;try{es=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
    for(const e of es){if(e.name.startsWith('.')||skip.has(e.name)||e.isSymbolicLink())continue;const p=path.join(dir,e.name);
      if(e.isDirectory()){out.push({path:p,name:e.name,folder:true});walk(p,depth+1);}else if(e.isFile())out.push({path:p,name:e.name,folder:false});
    }};
  for(const r of roots)walk(r,0);cache=out;at=Date.now();return out;
}
export function projects(){return index().filter(f=>f.folder&&['package.json','pyproject.toml','requirements.txt','Cargo.toml','go.mod','.git'].some(x=>fs.existsSync(path.join(f.path,x))));}
export function resolveProject(query,current,fallback){
  if(!query||query==='current'||query==='none')return current||fallback;
  if(/^(arrc|j)$/i.test(query))return fallback;
  const hits=projects().filter(p=>p.name.toLowerCase().includes(query.toLowerCase()));
  if(hits.length!==1)throw new Error(hits.length?`Which project: ${hits.slice(0,4).map(x=>x.name).join(', ')}?`:'No matching project found.');
  return safePath(hits[0].path,roots);
}
const allowed=/\.(pdf|docx?|pptx?|xlsx?|csv|txt|md|png|jpe?g|webp|mp[34]|mov)$/i;
export async function fileAction(op,text,ctx){
  if(!['find','open','folder','recent','content','info','path','reveal'].includes(op))throw new Error('Unsupported file operation. No files were changed.');
  let hits;
  if(op==='recent'){
    hits=index().filter(f=>!f.folder&&allowed.test(f.name)&&(!/pdf/i.test(text)||/\.pdf$/i.test(f.name))&&(!/download/i.test(text)||f.path.startsWith(path.join(HOME,'Downloads'))));
    hits=hits.map(f=>({...f,mtime:fs.statSync(f.path).mtimeMs})).filter(f=>!/today/i.test(text)||new Date(f.mtime).toDateString()===new Date().toDateString()).sort((a,b)=>b.mtime-a.mtime).slice(0,8);
  }else if(op==='content'){
    if(!text)return 'What text should I look for?';
    hits=index().filter(f=>!f.folder&&/\.(txt|md|csv)$/i.test(f.name)).slice(0,2000).filter(f=>{try{safePath(f.path,roots);return fs.statSync(f.path).size<200000&&fs.readFileSync(f.path,'utf8').toLowerCase().includes(text.toLowerCase());}catch{return false;}}).slice(0,8);
  }else if(/^\d+$/.test(text)){hits=[ctx.files?.[Number(text)-1]].filter(Boolean);}
  else if(path.isAbsolute(text)&&fs.existsSync(text)){hits=[{path:safePath(text,roots),name:path.basename(text),folder:fs.statSync(text).isDirectory()}];}
  else hits=index().filter(f=>(op==='folder'?f.folder:!f.folder&&allowed.test(f.name))&&f.name.toLowerCase().includes(text.toLowerCase())).slice(0,8);
  hits=hits.filter(f=>{try{safePath(f.path,roots);return true;}catch{return false;}});ctx.files=hits;
  if(!hits.length)return 'No matching files found.';
  if(['find','recent','content'].includes(op))return hits.map((f,i)=>`${i+1}. ${f.name}`).join('; ');
  if(hits.length!==1)return `Which one? ${hits.map((f,i)=>`${i+1}. ${f.name}`).join('; ')}`;
  const f=hits[0];const p=safePath(f.path,roots);
  if(op==='info')return `${f.name}, ${Math.round(fs.statSync(p).size/1024)} KB. ${p}`;
  if(op==='path')return p;
  if(op==='reveal'){await command('gdbus',['call','--session','--dest','org.freedesktop.FileManager1','--object-path','/org/freedesktop/FileManager1','--method','org.freedesktop.FileManager1.ShowItems',JSON.stringify(['file://'+encodeURI(p)]),'']);return `Revealed ${f.name}.`;}
  if(!f.folder&&!allowed.test(p))throw new Error('Only document and media files can be opened.');
  await launch('xdg-open',[p]);return `Opened ${f.name}.`;
}
export class ProjectRunner {
  constructor(){this.jobs=new Map();}
  async read(input,cwd,ctx){const [bin,args]=terminalPlan(input);const out=redact(await command(bin,args,{cwd}));ctx.output=out;return out.slice(0,700)||'Command finished with no output.';}
  plan(cwd,script){
    if(!fs.existsSync(path.join(cwd,'package.json')) && fs.existsSync(path.join(cwd,'arrc','package.json')))cwd=path.join(cwd,'arrc');
    const file=path.join(cwd,'package.json');
    if(!fs.existsSync(file))throw new Error('No package.json here. Select a Node project; arbitrary Python and shell execution are not enabled.');
    const pkg=JSON.parse(fs.readFileSync(file,'utf8'));const selected=script||(['dev','start'].find(k=>pkg.scripts?.[k]));
    if(!selected||!Object.hasOwn(pkg.scripts||{},selected)||!/^[\w:-]+$/.test(selected))throw new Error(`Choose a package script: ${Object.keys(pkg.scripts||{}).join(', ')}.`);
    const source=[pkg.scripts['pre'+selected],pkg.scripts[selected],pkg.scripts['post'+selected]].filter(Boolean).join(' ; ');
    if(/sudo|rm\s|curl|wget|\bdd\b|mkfs|\.ssh|\.env|git\s+(push|reset|clean)|chmod|chown/i.test(source))throw new Error('This script needs manual review before J can execute it.');
    return {cwd,script:selected,source,packageText:fs.readFileSync(file,'utf8')};
  }
  start(plan,session){
    if(fs.readFileSync(path.join(plan.cwd,'package.json'),'utf8')!==plan.packageText)throw new Error('Project scripts changed. Ask again.');
    const key=session+'|'+plan.cwd;if(this.jobs.get(key)?.running)return 'A J-managed process is already running here.';
    // Only the package script reviewed and confirmed by the owner is executable.
    const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!(/TOKEN|SECRET|PASSWORD|SARVAM|ARRC_|OWNER_|JARVIS/.test(k))));
    const child=spawn('npm',['run',plan.script],{cwd:plan.cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
    const job={child,running:true,output:'',script:plan.script};this.jobs.set(key,job);
    const append=b=>{job.output=(job.output+redact(String(b))).slice(-12000);};child.stdout.on('data',append);child.stderr.on('data',append);
    child.on('error',()=>{job.running=false;job.output='Could not start npm.';});child.on('exit',code=>{job.running=false;job.code=code;});
    return `Started ${plan.script} in ${path.basename(plan.cwd)}. Ask for project status to check the output.`;
  }
  status(cwd,session,ctx){const j=this.jobs.get(session+'|'+cwd);if(!j)return 'No process started by J in this project.';ctx.output=j.output;return `${j.script}: ${j.running?'running':'exited '+j.code}. ${j.output.slice(-600)}`;}
  stop(cwd,session){const j=this.jobs.get(session+'|'+cwd);if(!j?.running)return 'No J-managed process running here.';try{process.kill(-j.child.pid,'SIGTERM');}catch{}return 'Sent stop to the process J started.';}
  close(){for(const job of this.jobs.values())if(job.running){try{process.kill(-job.child.pid,'SIGTERM');}catch{}}}
}
