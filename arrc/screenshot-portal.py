"""Use GNOME's supported screenshot portal. The desktop may ask the user to approve."""
import sys
from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
loop = GLib.MainLoop()
request_path = None
def response(connection, sender, object_path, interface, signal, params):
    if object_path != request_path:
        return
    code, result = params.unpack()
    if code == 0 and result.get('uri'):
        print(result['uri'], flush=True)
    else:
        print('Screenshot cancelled or denied.', file=sys.stderr)
    loop.quit()
bus.signal_subscribe('org.freedesktop.portal.Desktop', 'org.freedesktop.portal.Request',
                     'Response', None, None, Gio.DBusSignalFlags.NONE, response)
request_path = bus.call_sync('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop',
              'org.freedesktop.portal.Screenshot', 'Screenshot',
              GLib.Variant('(sa{sv})', ('', {'interactive': GLib.Variant('b', True)})),
              None, Gio.DBusCallFlags.NONE, 5000, None).unpack()[0]
GLib.timeout_add_seconds(60, lambda: (loop.quit(), False)[1])
loop.run()
