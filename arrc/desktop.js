import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {secretLike,redact} from './safety.js';
export const has=bin=>(process.env.PATH||'').split(path.delimiter).some(p=>{try{fs.accessSync(path.join(p,bin),fs.constants.X_OK);return true;}catch{return false;}});
export function command(bin,args=[],options={}) {
  if(!has(bin))return Promise.reject(new Error(`${bin} is not installed. See the dependency instructions.`));
  return new Promise((resolve,reject)=>execFile(bin,args,{timeout:5000,maxBuffer:128*1024,...options},(e,out,err)=>e?reject(new Error(`${bin} could not complete: ${redact(err||e.code).slice(0,200)}`)):resolve(String(out).trim())));
}
export function launch(bin,args=[]) {
  if(!has(bin))throw new Error(`I couldn't find ${bin} installed.`);
  return new Promise((resolve,reject)=>{const p=spawn(bin,args,{detached:true,stdio:'ignore'});p.on('error',()=>reject(new Error(`Could not start ${bin}.`)));p.on('spawn',()=>{p.unref();resolve();});});
}
const HOME=os.homedir();
export function discoverApps(){
  const roots=['/usr/share/applications',path.join(HOME,'.local/share/applications'),'/var/lib/snapd/desktop/applications','/var/lib/flatpak/exports/share/applications',path.join(HOME,'.local/share/flatpak/exports/share/applications')];
  const found=[];
  for(const root of roots){if(!fs.existsSync(root))continue;for(const file of fs.readdirSync(root).filter(x=>x.endsWith('.desktop'))){
    const content=fs.readFileSync(path.join(root,file),'utf8').split(/\[Desktop Entry\]/)[1]?.split(/\n\[/)[0]||'';
    const name=content.match(/^Name=(.+)$/m)?.[1];if(name&&!/^Hidden=true$/m.test(content))found.push({name,id:file,path:path.join(root,file)});
  }}return found.filter((a,i)=>found.findIndex(b=>b.id===a.id)===i);
}
const aliases={vscode:'visual studio code',code:'visual studio code','vs code':'visual studio code',files:'org.gnome.Nautilus.desktop','file manager':'org.gnome.Nautilus.desktop',terminal:'org.gnome.Terminal.desktop',chrome:'google-chrome.desktop',browser:'google-chrome.desktop',settings:'org.gnome.Settings.desktop',calculator:'org.gnome.Calculator.desktop',notepad:'text editor'};
export async function openApp(query){
  const q=String(query).toLowerCase().trim();const key=(aliases[q]||q).toLowerCase();
  if(q==='downloads'||q==='documents'){await launch('xdg-open',[path.join(HOME,q==='downloads'?'Downloads':'Documents')]);return `Opened ${q}.`;}
  const all=discoverApps();let hits=all.filter(a=>a.name.toLowerCase()===key||a.id.toLowerCase()===key);
  if(!hits.length)hits=all.filter(a=>(a.name+' '+a.id).toLowerCase().includes(key));
  if(hits.length>1)return `Which app: ${hits.slice(0,5).map(a=>a.name).join(', ')}?`;
  if(!hits.length)return `I couldn't find ${query} among installed desktop apps.`;
  await command('gio',['launch',hits[0].path]);return `Opened ${hits[0].name}.`;
}
export async function clipboard(op,text=''){
  const wl=!!process.env.WAYLAND_DISPLAY;
  if(op==='read'){
    const value=await command(wl?'wl-paste':'xclip',wl?['--no-newline']:['-selection','clipboard','-o']);
    if(secretLike(value))return 'Clipboard looks like a password or token. I will not read it aloud.';
    return value.slice(0,700)||'Clipboard is empty.';
  }
  if(op!=='write'&&op!=='clear')throw new Error('Use clipboard read, write or clear.');
  if(secretLike(text))throw new Error('Secret-looking text cannot be copied through the voice tool.');
  const bin=wl?'wl-copy':'xclip';if(!has(bin))throw new Error('Clipboard support is missing.');
  await new Promise((resolve,reject)=>{const p=spawn(bin,wl?[]:['-selection','clipboard'],{stdio:['pipe','ignore','ignore']});p.on('error',reject);p.on('close',c=>c?reject(new Error('Clipboard write failed.')):resolve());p.stdin.end(op==='clear'?'':text);});
  return op==='clear'?'Clipboard cleared.':'Copied to clipboard.';
}
export async function media(op,text=''){
  if(op==='search'||op==='play_search'){await launch('xdg-open',[`spotify:search:${encodeURIComponent(text)}`]);return `Opened Spotify search for ${text}. Select a result to start playback; searching alone does not play it.`;}
  if(op==='volume')return system('volume',text);
  const players=(await command('playerctl',['-l'])).split('\n');const player=players.find(x=>x==='spotify'||x.startsWith('spotify.'))||players[0];
  if(!player)throw new Error('No media player is running. Open Spotify first.');
  if(op==='status'||op==='metadata')return await command('playerctl',['-p',player,'metadata','--format','{{status}}: {{title}} by {{artist}}']);
  const map={pause:'pause',resume:'play',play:'play',next:'next',previous:'previous','play-pause':'play-pause'};
  if(!map[op])throw new Error('Use pause, resume, next, previous, status or search.');
  await command('playerctl',['-p',player,map[op]]);return `Media ${op} sent to ${player}.`;
}
export async function system(op,text=''){
  if(op==='ram')return `RAM: ${((os.totalmem()-os.freemem())/2**30).toFixed(1)} of ${(os.totalmem()/2**30).toFixed(1)} GB used.`;
  if(op==='cpu'){const sample=()=>os.cpus().reduce((a,c)=>{a.idle+=c.times.idle;a.total+=Object.values(c.times).reduce((s,t)=>s+t,0);return a;},{idle:0,total:0});const a=sample();await new Promise(r=>setTimeout(r,300));const b=sample();return `CPU usage ${Math.round(100*(1-(b.idle-a.idle)/(b.total-a.total)))} percent.`;}
  if(op==='disk')return command('df',['-h',HOME]);
  if(op==='uptime')return `Uptime ${Math.floor(os.uptime()/3600)} hours.`;
  if(op==='ip')return Object.entries(os.networkInterfaces()).flatMap(([name,ips])=>ips.filter(x=>!x.internal&&x.family==='IPv4').map(x=>`${name}: ${x.address}`)).join('; ')||'No local IPv4 address.';
  if(op==='network'||op==='wifi')return command('nmcli',op==='wifi'?['radio','wifi']:['-t','-f','DEVICE,TYPE,STATE','device']);
  if(op==='bluetooth')return command('bluetoothctl',['show']);
  if(op==='audio')return command('pactl',['get-default-sink']);
  if(op==='volume'){
    if(!text)return command('pactl',['get-sink-volume','@DEFAULT_SINK@']);
    const q=text.toLowerCase();if(q==='mute'||q==='unmute'){await command('pactl',['set-sink-mute','@DEFAULT_SINK@',q==='mute'?'1':'0']);return q==='mute'?'Muted.':'Unmuted.';}
    const value=q==='up'?'+5%':q==='down'?'-5%':/^\d{1,3}%?$/.test(q)&&parseInt(q)<=100?parseInt(q)+'%':null;
    if(!value)throw new Error('Use volume up, down, mute, unmute or 0 to 100.');await command('pactl',['set-sink-volume','@DEFAULT_SINK@',value]);return `Volume ${value}.`;
  }
  if(op==='brightness'){if(!text)return command('brightnessctl',['get']);const v=text==='up'?'+5%':text==='down'?'5%-':/^\d{1,3}%?$/.test(text)&&parseInt(text)>=5&&parseInt(text)<=100?parseInt(text)+'%':null;if(!v)throw new Error('Brightness must be 5 to 100 percent, up or down.');await command('brightnessctl',['set',v]);return `Brightness ${v}.`;}
  throw new Error('Unknown system operation.');
}
export async function windows(op,target=''){
  if(process.env.XDG_SESSION_TYPE==='wayland'){
    const list=await windowList();
    if(op==='list')return list.map(w=>`${w.id}: ${w.title}`).join('; ');
    if(op==='active')return list.find(w=>w.active)?.title||'No active application.';
    if(op==='desktop')return windowApply('',op);
    const hits=target==='current'?list.filter(w=>w.active):list.filter(w=>(w.app+' '+w.title).toLowerCase().includes(target.toLowerCase()));
    if(!target||hits.length!==1)return 'Name one unambiguous window from the window list.';
    if(!['focus','minimize','maximize','restore'].includes(op))return 'Use window_action close for confirmed window closure.';
    return windowApply(hits[0].id,op);
  }
  if(op==='list')return command('wmctrl',['-l']);
  const listing=await command('wmctrl',['-l']);const hits=listing.split('\n').filter(l=>l.toLowerCase().includes(target.toLowerCase()));
  if(!target||hits.length!==1)return 'Name one unambiguous window from the window list.';
  const id=hits[0].split(' ')[0];
  const args=op==='focus'?['-ia',id]:op==='maximize'?['-ir',id,'-b','add,maximized_vert,maximized_horz']:op==='minimize'?['-ir',id,'-b','add,hidden']:null;
  if(!args)return 'Window close and show-desktop are not enabled. Use the desktop controls.';
  await command('wmctrl',args);return `Window ${op} completed.`;
}
export async function windowList(){
  try{
    const raw=await command('gdbus',['call','--session','--dest','org.gnome.Shell','--object-path','/org/arrc/Windows','--method','org.arrc.Windows.List']);
    // gdbus prints a GVariant tuple containing one quoted JSON string.
    const p=raw.slice(1,raw.lastIndexOf(',')).trim();
    const value=p.startsWith("'")?p.slice(1,-1).replace(/\\'/g,"'").replace(/\\\\/g,'\\'):JSON.parse(p);
    return JSON.parse(value);
  }catch{throw new Error('GNOME Window Bridge is not enabled. Install the included GNOME extension, then log out and back in. Chrome tab control remains available.');}
}
export async function windowApply(id,op){await command('gdbus',['call','--session','--dest','org.gnome.Shell','--object-path','/org/arrc/Windows','--method','org.arrc.Windows.Apply',String(id),op]);return `Window ${op} completed.`;}
export async function terminalType(text){
  const response=await command('gdbus',['call','--session','--dest','org.gnome.Shell','--object-path','/org/arrc/Windows','--method','org.arrc.Windows.Terminal',text]);
  const value=response.match(/^\('(.*)',\)$/)?.[1] ?? response;
  if(!/Typed and ran/.test(value))throw new Error(value.replace(/\\'/g,"'"));
  return value;
}
