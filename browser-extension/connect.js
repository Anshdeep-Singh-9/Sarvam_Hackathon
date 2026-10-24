import {execute} from './runtime.js';
let running=false, token='';
const status=document.querySelector('#status');
const api=async(route,options={})=>fetch('http://127.0.0.1:3711'+route,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});
document.querySelector('#permissions').onclick=async()=>{const ok=await chrome.permissions.request({origins:['<all_urls>']});status.textContent=ok?'Page interaction enabled.':'Permission declined; tab control still works.';};
document.querySelector('#disconnect').onclick=()=>{running=false;token='';status.textContent='Disconnected';};
document.querySelector('#connect').onclick=async()=>{
  if(running)return;
  token=document.querySelector('#token').value.trim();document.querySelector('#token').value='';
  if(!token)return;
  running=true;
  while(running){
    try{
      const r=await api('/poll');if(!r.ok)throw new Error('Connection refused. Check your bridge token.');
      status.textContent='ONLINE — listening for J';
      for(const job of await r.json()){
        let result;
        try{if(Date.now()>job.expires)throw new Error('Command expired.');result=await execute(job.op,job.args);}catch(e){result={error:e.message};}
        if(running)await api('/result',{method:'POST',body:JSON.stringify({id:job.id,...result})});
      }
    }catch(e){status.textContent=e.message;await new Promise(r=>setTimeout(r,1500));}
  }
};
