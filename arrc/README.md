# ARRC laptop server

For the current Ubuntu action engine, Chrome extension setup, full action reference, security
model and test instructions, see [UBUNTU-UPGRADE.md](../UBUNTU-UPGRADE.md).

The part of J that runs on your laptop.

Easiest: open the folder above in Claude Code and type "Set up J for me" (see `../CLAUDE.md`).
Full manual steps are in `../ARRC-Build-Guide.pdf`.

```
npm install
node setup.js 919876543210   (your mobile number; creates .env with a fresh password)
node start.js                (server + tunnel; prints the tool URL for Sarvam)
```

`node setup.js --show-token` prints J's password again. Saving `.env` while J runs restarts the
server without changing the tunnel address. `npm start` runs the server alone, without a tunnel.

Every action J can take is in `server.js`, inside `const ACTIONS = {`. Add your own there.

## Ubuntu

The batch launcher remains for Windows. Ubuntu uses `../Start-J.sh`. Added Ubuntu modules provide
Chrome tabs/pages through a local extension, discovered apps, native media, clipboard, projects,
files, system information and screenshots. GNOME window control uses the included GNOME 46
extension. Laptop speech and generic desktop keystrokes are not implemented.

`node doctor.js` reports dependencies. `npm test` runs regression/security/browser fixture tests.
