import {has,discoverApps} from './desktop.js';
console.log('Session:',process.env.XDG_SESSION_TYPE||'unknown');
for(const bin of ['google-chrome','playerctl','wl-copy','wl-paste','pactl','brightnessctl','nmcli','bluetoothctl','gnome-terminal','code','git','docker','tree','lsof'])console.log(bin+': '+(has(bin)?'available':'missing (optional)'));
console.log('Desktop applications discovered:',discoverApps().length);
console.log('GNOME Wayland screenshot picker uses /usr/bin/python3 with python3-gi.');
console.log('Optional install: sudo apt install playerctl wl-clipboard brightnessctl tree lsof');
console.log('X11 only: sudo apt install wmctrl xdotool xclip gnome-screenshot');
console.log('Chrome bridge: load ../browser-extension in chrome://extensions, open its toolbar icon, run node bridge-pair.js, paste token, Connect, Allow page interaction.');
