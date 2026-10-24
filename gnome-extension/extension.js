import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import Gdk from 'gi://Gdk';
const XML='<node><interface name="org.arrc.Windows"><method name="List"><arg type="s" direction="out"/></method><method name="Apply"><arg type="s" direction="in"/><arg type="s" direction="in"/><arg type="s" direction="out"/></method><method name="Terminal"><arg type="s" direction="in"/><arg type="s" direction="out"/></method></interface></node>';
const TERMINALS=['gnome-terminal','tilix','kitty','alacritty','terminator','xterm','konsole','foot','wezterm','st','sakura','xfce4-terminal','mate-terminal','lxterminal','guake','tilda'];
export default class JWindows extends Extension {
  enable(){this._dbus=Gio.DBusExportedObject.wrapJSObject(XML,this);this._dbus.export(Gio.DBus.session,'/org/arrc/Windows');}
  disable(){this._dbus?.unexport();this._dbus=null;}
  _windows(){return global.get_window_actors().map(a=>a.meta_window).filter(w=>!w.skip_taskbar);}
  List(){return JSON.stringify(this._windows().map(w=>({id:String(w.get_id()),title:w.get_title(),app:w.get_wm_class(),active:w===global.display.focus_window})));}
  Apply(id,op){
    const windows=this._windows();const w=windows.find(w=>String(w.get_id())===id);
    if(op==='desktop'){for(const item of windows)item.minimize();return 'Desktop shown.';}
    if(!w)return 'Window no longer exists.';
    if(op==='focus'){w.unminimize();w.activate(global.get_current_time());}
    else if(op==='minimize')w.minimize();
    else if(op==='maximize')w.maximize(Meta.MaximizeFlags.BOTH);
    else if(op==='restore')w.unmaximize(Meta.MaximizeFlags.BOTH);
    else if(op==='close')w.delete(global.get_current_time());
    else return 'Unsupported window action.';
    return 'Window '+op+' completed.';
  }
  Terminal(text){
    const window=global.display.get_focus_window();
    const klass=window?.get_wm_class()?.toLowerCase() ?? '';
    if(!TERMINALS.some(name=>klass.includes(name))) return 'Focus a terminal window first.';
    if(!text || text.length>1000 || /[\r\n\0]/.test(text)) return 'Invalid terminal text.';
    const keyboard=Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    let time=Clutter.CURRENT_TIME;
    const key=(value)=>{keyboard.notify_keyval(time++,value,Clutter.KeyState.PRESSED);keyboard.notify_keyval(time++,value,Clutter.KeyState.RELEASED);};
    for(const char of text){const keyval=Gdk.unicode_to_keyval(char.codePointAt(0));if(!keyval) return 'Unsupported terminal character.';key(keyval);}
    key(Clutter.KEY_Return);
    return 'Typed and ran the approved command in the focused terminal.';
  }
}
