import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const file=new URL('.browser-token',import.meta.url);
if(!fs.existsSync(file)){console.log('Start J first, then run this helper.');process.exit(1);}
const wayland=!!process.env.WAYLAND_DISPLAY;
const r=spawnSync(wayland?'wl-copy':'xclip',wayland?[]:['-selection','clipboard'],{input:fs.readFileSync(file),timeout:3000});
console.log(r.status===0?'Bridge token copied. Paste it only into the J Browser Bridge extension.':'Clipboard unavailable. Install wl-clipboard on Wayland or xclip on X11.');
