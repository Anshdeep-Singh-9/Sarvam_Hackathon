import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeEqual } from './safety.js';

export function createBridge(root, port = Number(process.env.J_BRIDGE_PORT || 3711)) {
  const tokenFile = path.join(root,'.browser-token');
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
  const token = fs.readFileSync(tokenFile,'utf8').trim();
  const pending = new Map(); const queue = []; let lastSeen = 0; let poll = null;
  const reply = (res, code, data) => { res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
  const flush = () => { if(poll && queue.length) { const p = poll; poll = null; reply(p,200,queue.splice(0)); } };
  const server = http.createServer(async(req,res) => {
    if (req.headers.host !== `127.0.0.1:${port}` || req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return reply(res,403,{});
    const origin = req.headers.origin;
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return reply(res,403,{});
    if (origin) { res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); }
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods','GET, POST'); return res.end(); }
    if (!safeEqual(String(req.headers.authorization || '').replace(/^Bearer /,''),token)) return reply(res,401,{});
    lastSeen = Date.now();
    if(req.method === 'GET' && req.url === '/poll') {
      if(poll) reply(poll,200,[]);
      poll=res; flush(); const timer=setTimeout(()=>{if(poll===res){poll=null;reply(res,200,[]);}},15000);
      res.on('close',()=>{clearTimeout(timer); if(poll===res)poll=null;}); return;
    }
    if(req.method === 'POST' && req.url === '/result') {
      try {
        let raw=''; for await(const c of req){raw+=c; if(raw.length>12000000) throw new Error('limit');}
        const result=JSON.parse(raw); const p=pending.get(result.id);
        if(p){pending.delete(result.id);clearTimeout(p.timer);p.resolve(result);}
        return reply(res,200,{ok:true});
      }catch{return reply(res,400,{});}
    }
    reply(res,404,{});
  });
  server.on('error',e=>console.error('Browser bridge unavailable:',e.code));
  server.listen(port,'127.0.0.1');
  return {
    status:()=>({online:Date.now()-lastSeen<25000,port}),
    async call(op,args={}) {
      if(Date.now()-lastSeen>25000) throw new Error('Chrome control is offline. Open the J Browser Bridge extension and connect.');
      const id=crypto.randomUUID();
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{pending.delete(id);const i=queue.findIndex(x=>x.id===id);if(i>=0)queue.splice(i,1);reject(new Error('Chrome did not respond. Check the bridge tab.'));},7000);
        pending.set(id,{resolve,reject,timer});queue.push({id,op,args,expires:Date.now()+6500});flush();
      });
    },
    close:()=>{if(poll)reply(poll,200,[]);server.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Bridge stopped.'));}},
  };
}
