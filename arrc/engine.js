import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Confirmations,redact,secretLike,terminalPlan} from './safety.js';
import {createBridge} from './browser-bridge.js';
import {openApp,discoverApps,clipboard,media,system,windows,windowList,windowApply,terminalType,command,launch,has} from './desktop.js';
import {fileAction,resolveProject,projects,ProjectRunner} from './workspace.js';

export function createEngine(root){
  const bridge=createBridge(root), confirmations=new Confirmations(), sessions=new Map(),runner=new ProjectRunner();
  const captures=fs.mkdtempSync(path.join(os.tmpdir(),'arrc-captures-'));fs.chmodSync(captures,0o700);
  const context=session=>{let c=sessions.get(session);if(!c||Date.now()-c.at>15*60000){c={};sessions.set(session,c);}c.at=Date.now();for(const [k,v] of sessions)if(Date.now()-v.at>15*60000)sessions.delete(k);return c;};
  const split=input=>{const s=String(input??'').trim();if(s.startsWith('{')){try{return JSON.parse(s);}catch{throw new Error('Input must be valid JSON.');}}const [op,...rest]=s.split('|').map(x=>x.trim());return {op,text:rest.join(' | ')};};
  async function browser(op,a,ctx,session){
    const copyField = op==='copy_url' ? 'url' : op==='copy_title' ? 'title' : null;
    if(copyField)op='info';
    const args={text:a.text||'',target:a.target};
    const listed=await bridge.call('list');if(listed.error)throw new Error(listed.error);const tabs=listed.tabs||[];
    if(op==='list'){ctx.tabs=tabs;return `You have ${tabs.length} tabs. ${tabs.slice(0,15).map((t,i)=>`${i+1}. ${t.title}`).join('; ')}`;}
    const target=a.tab||(['switch','close','pin','unpin','duplicate'].includes(op)?a.text:'');
    if(target&&target!=='current'&&target!=='none'){
      let hits;
      if(/^\d+$/.test(target))hits=[(ctx.tabs||tabs)[Number(target)-1]].filter(Boolean);
      else {const q=target.toLowerCase();hits=tabs.filter(t=>t.title.toLowerCase()===q);if(!hits.length)hits=tabs.filter(t=>(t.title+' '+t.url).toLowerCase().includes(q));}
      if(!hits.length)return 'No matching tab.';
      if(hits.length>1&&!(op==='close'&&a.all))return `Which tab? ${hits.slice(0,5).map(t=>t.title).join('; ')}`;
      args.tabId=hits[0].id;if(op==='close'&&a.all)args.ids=hits.map(t=>t.id);
    }
    if(['new','open','download'].includes(op)){let u=a.url||a.text;const sites={chatgpt:'https://chatgpt.com',github:'https://github.com',linkedin:'https://linkedin.com',classroom:'https://classroom.google.com'};u=sites[String(u).toLowerCase()]||u;if(u&&!/^https?:\/\//.test(u))u='https://'+u;args.url=u;}
    if(op==='search'){args.url='https://www.google.com/search?q='+encodeURIComponent(a.text);op='new';}
    if(op==='result'){const r=await bridge.call('results',args);const n=Number(a.text||1);const link=r.links?.[n-1];if(!link)return 'That search result was not found.';return browser('new',{url:link.url},ctx,session);}
    if(op==='move')args.index=Number(a.text);
    const r=await bridge.call(op,args);if(r.error)throw new Error(r.error);
    if(copyField)return clipboard('write',r[copyField]||'');
    if(r.confirmation)return confirmations.request(session,r.confirmation,async()=>{const done=await bridge.call('commit',{ticket:r.ticket});if(done.error)throw new Error(done.error);return done.text;});
    if(r.image){const f=path.join(captures,crypto.randomUUID()+'.png');fs.writeFileSync(f,Buffer.from(r.image.replace(/^data:image\/png;base64,/,''),'base64'),{mode:0o600});ctx.capture=f;return `Browser screenshot saved to ${f}.`;}
    if(r.links){ctx.links=r.links;return r.links.slice(0,12).map((l,i)=>`${i+1}. ${l.title}: ${l.url}`).join('; ').slice(0,1400);}
    if(a.copy){if(secretLike(r.text))return 'That content looks sensitive. I will not copy it.';return clipboard('write',r.text||'');}
    return redact(r.text).slice(0,1600);
  }
  const actions={
    confirm_action:({input,session})=>confirmations.confirm(session,String(input||'')),
    cancel_action:({session})=>confirmations.cancel(session),
    browser_action:async({input,session})=>{const a=split(input);return browser(a.op,a,context(session),session);},
    app_action:async({input,session})=>{const a=split(input);if(a.op==='list')return discoverApps().map(x=>x.name).slice(0,35).join(', ');if(a.op==='open')return openApp(a.text);if(a.op==='close')return actions.window_action({input,session});return windows(a.op,a.text);},
    window_action:async({input,session})=>{
      const a=split(input);
      if(a.op==='close'){
        const list=await windowList();const hits=a.text==='current'?list.filter(w=>w.active):list.filter(w=>(w.app+' '+w.title).toLowerCase().includes(a.text.toLowerCase()));
        if(!a.text||!hits.length)return 'Name a window to close.';
        if(hits.length>1&&!a.all)return `Which window: ${hits.map(w=>w.title).join('; ')}?`;
        return confirmations.request(session,`Close ${hits.length} window(s): ${hits.map(w=>w.title).join('; ')}? Unsaved work may be lost.`,async()=>{
          const now=await windowList();for(const w of hits)if(!now.some(n=>n.id===w.id&&n.title===w.title))return 'A window changed. Ask again.';
          for(const w of hits)await windowApply(w.id,'close');return 'Closed the confirmed windows.';
        });
      }
      return windows(a.op,a.text);
    },
    media_action:({input})=>{const a=split(input);return media(a.op,a.text);},
    clipboard_action:({input,session})=>{const a=split(input);if(a.op==='copy_output')return clipboard('write',context(session).output||'');return clipboard(a.op,a.text);},
    system_action:({input,session})=>{const a=split(input);if(['shutdown','restart','lock'].includes(a.op)){const args=a.op==='lock'?['lock-session']:[a.op==='shutdown'?'poweroff':'reboot'];return confirmations.request(session,`${a.op} this laptop?`,async()=>{await command(a.op==='lock'?'loginctl':'systemctl',args);return `${a.op} requested.`;});}return system(a.op,a.text);},
    file_action:async({input,session})=>{const a=split(input);const r=await fileAction(a.op,a.text,context(session));return a.op==='path'?clipboard('write',r):r;},
    project_action:async({input,session})=>{
      const a=split(input),ctx=context(session);if(a.op==='list')return projects().slice(0,20).map(p=>p.name).join(', ');
      const cwd=resolveProject(a.project||(['open','select','terminal'].includes(a.op)?a.text:''),ctx.project,path.dirname(root));ctx.project=cwd;
      if(a.op==='select')return `Selected ${path.basename(cwd)}.`;
      if(a.op==='open'){await launch('code',[cwd]);return `Opened ${path.basename(cwd)} in VS Code.`;}
      if(a.op==='terminal'){await launch('gnome-terminal',['--working-directory='+cwd]);return `Opened terminal in ${path.basename(cwd)}.`;}
      if(a.op==='status')return runner.status(cwd,session,ctx);
      if(a.op==='stop')return runner.stop(cwd,session);
      if(a.op==='run'){const plan=runner.plan(cwd,a.script||a.text);ctx.project=plan.cwd;return confirmations.request(session,`Run npm script ${plan.script} in ${path.basename(plan.cwd)}: ${redact(plan.source)}? This runs project code.`,()=>runner.start(plan,session));}
      if(a.op==='readme'){const file=path.join(cwd,'README.md');if(!fs.existsSync(file))return 'No README.md in this project.';await launch('code',[file]);return 'Opened README.';}
      if(a.op==='git_pull')return confirmations.request(session,`Pull changes into ${path.basename(cwd)}?`,async()=>redact(await command('git',['pull','--ff-only'],{cwd,timeout:6000})).slice(0,600));
      throw new Error('Unknown project operation.');
    },
    terminal_safe:({input,session})=>{const ctx=context(session);return runner.read(input,ctx.project||path.dirname(root),ctx);},
    terminal_action:async({input,session})=>{
      const a=split(input),ctx=context(session);
      if(a.op==='open') { await launch('gnome-terminal',ctx.project?[`--working-directory=${ctx.project}`]:[]); return ctx.project ? `Opened terminal in ${path.basename(ctx.project)}.` : 'Opened terminal.'; }
      if(a.op!=='run') throw new Error('Use terminal action open or run.');
      const [bin,args]=terminalPlan(a.text);
      const quote=s=>/^[A-Za-z0-9_./:=+%-]+$/.test(s)?s:`'${s.replace(/'/g,"'\\''")}'`;
      const line=[bin,...args].map(quote).join(' ');
      const output=await runner.read(a.text,ctx.project||path.dirname(root),ctx);
      await terminalType(line);
      return `${output.slice(0,500)} ${ctx.project ? `Typed ${line} into the focused terminal; it runs in that terminal's own folder.` : `Typed ${line} into the focused terminal.`}`;
    },
    desktop_action:async({input,session})=>{
      const a=split(input);if(a.op==='screenshot'){
        if(process.env.XDG_SESSION_TYPE==='wayland') {
          const ctx=context(session);if(ctx.capturePending)return 'The screenshot picker is already open.';ctx.capturePending=true;
          execFile('/usr/bin/python3',[path.join(root,'screenshot-portal.py')],{timeout:65000},(err,out)=>{
            ctx.capturePending=false;
            try{if(err||!out.trim().startsWith('file:'))throw new Error();const source=fileURLToPath(out.trim());const target=path.join(captures,crypto.randomUUID()+'.png');fs.copyFileSync(source,target);fs.chmodSync(target,0o600);ctx.capture=target;ctx.captureError=null;}catch{ctx.captureError='Screenshot was cancelled or unavailable.';}
          });
          return 'Choose the screen, window or region in the GNOME screenshot picker. Then ask for screenshot status.';
        }
        if(!has('gnome-screenshot'))return 'Install gnome-screenshot for X11 screenshot support.';
        const f=path.join(captures,crypto.randomUUID()+'.png');await command('gnome-screenshot',[...(a.text==='window'?['-w']:[]),'-f',f]);context(session).capture=f;return `Screenshot saved to ${f}.`;
      }
      if(a.op==='screenshot_status'){const ctx=context(session);return ctx.capturePending?'Waiting for the screenshot picker.':ctx.captureError|| (ctx.capture?`Screenshot saved to ${ctx.capture}.`:'No screenshot yet.');}
      return 'Global typing, mouse clicks and shortcuts are restricted on GNOME Wayland. Use semantic browser actions, or use the keyboard directly.';
    },
  };
  const aliases={browser_list_tabs:['browser_action','list'],browser_current_tab:['browser_action','info'],browser_new_tab:['browser_action','new'],browser_switch_tab:['browser_action','switch'],browser_close_tab:['browser_action','close'],browser_reload:['browser_action','reload'],browser_back:['browser_action','back'],browser_forward:['browser_action','forward'],browser_open_url:['browser_action','open'],browser_search:['browser_action','search'],browser_find_text:['browser_action','find'],browser_scroll:['browser_action','scroll'],browser_click:['browser_action','click'],browser_type:['browser_action','type'],browser_press_key:['browser_action','key'],browser_extract_text:['browser_action','text'],browser_get_links:['browser_action','links'],browser_download:['browser_action','download'],browser_screenshot:['browser_action','screenshot'],browser_page_info:['browser_action','info'],browser_focus_element:['browser_action','focus'],project_open:['project_action','open'],project_run:['project_action','run'],project_stop:['project_action','stop'],open_terminal_here:['project_action','terminal'],file_find:['file_action','find'],file_open:['file_action','open'],folder_open:['file_action','folder'],file_recent:['file_action','recent'],file_search_content:['file_action','content'],file_info:['file_action','info'],reveal_file:['file_action','reveal'],screen_capture:['desktop_action','screenshot'],active_window_capture:['desktop_action','screenshot | window']};
  for(const [name,[action,op]] of Object.entries(aliases))actions[name]=({input,session})=>actions[action]({input:op+' | '+(input==='none'?'':input||''),session});
  for(const [name,cmd] of Object.entries({git_status:'git status',git_log:'git log',list_ports:'ss',docker_ps:'docker ps'}))actions[name]=({session})=>actions.terminal_safe({input:cmd,session});
  actions.browser_copy_text=({input,session})=>browser(input==='last response'?'last_response':'selection',{copy:true},context(session),session);
  actions.active_window_capture=({session})=>actions.desktop_action({input:'screenshot | window',session});
  return {actions,status:()=>({browser:bridge.status(),spotify:has('playerctl'),terminal:true,session:process.env.XDG_SESSION_TYPE||'unknown'}),confirmations,close:()=>{runner.close();bridge.close();}};
}
