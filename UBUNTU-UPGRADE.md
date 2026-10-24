# J on Ubuntu: setup, capabilities and verification

Sarvam Test Agent Voice remains the voice interface. The original `laptop_action` tool and
`action`, `input`, `caller` fields are unchanged. No local speech recognition or wake word was added.

## Finish the Chrome connection

1. Keep `./Start-J.sh` running. The dashboard is http://localhost:3710.
2. In your normal Chrome profile, open `chrome://extensions` and enable Developer mode.
3. Click **Load unpacked** and select this project's `browser-extension` directory.
4. Click the **J Browser Bridge** toolbar icon. Pin it if convenient. Its connection tab must stay open.
5. From the project root run `node arrc/bridge-pair.js`. This copies a separate local bridge token
   without printing it. Paste into the extension's password field and click **Connect**.
6. Click **Allow page interaction** and accept Chrome's website-access prompt. This permission is
   necessary for reading/filling pages and taking screenshots. Tab listing/switching uses the tabs
   permission; page interaction is optional until you grant it.
7. Leave the bridge tab open, then activate an ordinary webpage you want J to control.
   The dashboard should show **Browser bridge ONLINE**.

The bridge controls your **existing Chrome tabs and logged-in sessions**, not an isolated J profile.
It uses a second authenticated server at **127.0.0.1:3711**, never a public debugging port.
The connection tab contacts only that localhost address. Chrome's own website navigation still
works normally. Bridge credentials are memory-only in the extension; reconnect after closing it.
Only install the extension in one profile at a time for this bridge instance.

Chrome internal pages, extension pages, incognito and file URLs are excluded from action targets.
Chrome requires broad host permission for unattended visible-tab capture; the extension requests
it explicitly, but its command dispatcher still restricts targets to ordinary HTTP/HTTPS pages.
Browser page extraction is limited to the main frame; complex cross-origin frames, closed shadow
roots, custom editors and synthetic-key-resistant sites may need manual interaction.

Why an extension: modern Chrome restricts remote debugging of the normal default profile.
An extension gives supported tabs/scripting APIs without exporting cookies or enabling CDP.
Reference: https://developer.chrome.com/blog/remote-debugging-port

## Update Sarvam

**No Sarvam tool schema change required; only update description/instructions.**

- Agent Instructions: paste `J-agent/1-instructions-prompt.txt` (`./Copy-for-Sarvam.sh 1`).
- Tool `laptop_action` description: paste `J-agent/2-tool-description.txt` (`./Copy-for-Sarvam.sh 3`).
- Keep POST, Bearer secret, action/input text fields, and caller = platform **User Identifier**.
- Keep `ALLOW_NO_CALLER=true` for browser testing. This permits any supplied caller identifier
  with the correct Bearer token; it does not waive Bearer authentication.
- Use the current `/action` tunnel URL. `./Copy-for-Sarvam.sh 4` copies it.
- Test the edited draft using **Test agent → Voice**. Commit a version after testing to preserve
  the updated configuration; deployment to a rented number is unnecessary for browser testing.
- Keep your existing Bearer secret. Restarting does not regenerate it.

A good smoke test is: "What is my battery?", "List my Chrome tabs", "Switch to GitHub",
"What is the page title?", "Scroll down", "Open Spotify", "What's playing?", "Run pwd".
Then try "Click Sign in" and verify J asks for confirmation. Say "cancel" first, then try again
and explicitly confirm. Never expect the tool to submit anything before confirmation.

## What changed

Before: URL opening, YouTube search/play, a small fixed app list, notes, document search,
timers, battery/locking, Gmail drafts, routines, deadlines and optional Classroom automation.
Incomplete Ubuntu behavior: media and screenshots returned unavailable, routines still invoked
Windows apps, no tab/session control, no project runner, no shared confirmation mechanism,
and the HTTP server listened on all interfaces.

Now: the existing router delegates to focused browser, desktop, workspace and safety modules.
The dashboard remains intact with category labels and bridge/media/session indicators.
The HTTP server and browser bridge bind to loopback. The original notes, deadlines,
YouTube, dashboard and Classroom modules remain in place.

Changed/added files:

- `arrc/server.js`: integration, auth handling, caller-scoped requests, local dashboard protection,
  confirmations for locking/Classroom, Linux app/media/routine fixes, redacted logs.
- `arrc/engine.js`: action routing, session context, browser matching, screenshots, confirmations.
- `arrc/safety.js`: secret filtering, file boundaries, read-only command allowlist, confirmations.
- `arrc/browser-bridge.js`, `bridge-pair.js`: authenticated local command queue and private pairing.
- `browser-extension/{manifest.json,background.js,connect.html,connect.js,runtime.js}`: real Chrome control.
- `arrc/desktop.js`: desktop app discovery, media, clipboard, system and GNOME/X11 window operations.
- `arrc/workspace.js`: bounded project/file index and owned project processes.
- `arrc/screenshot-portal.py`: GNOME's user-approved screenshot portal.
- `gnome-extension/{metadata.json,extension.js}`: fixed window operations over the local session bus.
- `arrc/start.js`: loopback tunnel target and watching all action modules.
- `arrc/live.html`, `.env.example`, `.gitignore`, `package.json`, `doctor.js`: UI, documentation,
  credential exclusions and verification command.
- `arrc/test/{engine.test.js,browser.test.js}`: regression/security/browser tests.
- `J-agent/*.txt`, `UBUNTU-UPGRADE.md`, `arrc/README.md`: voice routing and setup instructions.

The private `.env` and its existing credentials were not replaced. The bridge creates its own
mode-0600 `.browser-token`. Screenshots go into private `arrc-captures-*` temporary directories.

## Action reference

Input uses `operation | text`, or a JSON string such as
`{"op":"type","target":"Search","text":"remote backend internships"}`.
No extra Sarvam HTTP tools are needed.

| Action | Operations |
| --- | --- |
| `browser_action` | list, info, new, open, switch, close, duplicate, pin, unpin, move, reload, back, forward, search, result, find, scroll, click, focus, type, key, text, links, selection, last_response, download, download_status, screenshot |
| `app_action` | list, open, focus, minimize, maximize, restore, close |
| `window_action` | list, active, focus, minimize, maximize, restore, desktop, close |
| `media_action` | search, play_search, play, pause, resume, next, previous, play-pause, status, metadata, volume |
| `clipboard_action` | read, write, clear, copy_output |
| `system_action` | ram, cpu, disk, uptime, ip, network, wifi, bluetooth, audio, volume, brightness, lock, shutdown, restart |
| `file_action` | find, open, folder, recent, content, info, reveal, path (copies path) |
| `project_action` | list, select, open, terminal, run, status, stop, readme, git_pull |
| `terminal_safe` | pwd, ls, tree, whoami, date, uptime, df, du, free, ps, ss, lsof, git status, git log, git branch, git diff, docker ps |
| `terminal_action` | open a visible terminal, or type and run an approved read-only terminal command in the focused GNOME Terminal |
| `desktop_action` | screenshot, screenshot_status |
| `confirm_action` / `cancel_action` | approve exact pending operation by its ID / cancel |

Convenience aliases (same implementation, not separate Sarvam tools):

`browser_list_tabs`, `browser_current_tab`, `browser_new_tab`, `browser_switch_tab`,
`browser_close_tab`, `browser_reload`, `browser_back`, `browser_forward`, `browser_open_url`,
`browser_search`, `browser_find_text`, `browser_scroll`, `browser_click`, `browser_type`,
`browser_press_key`, `browser_extract_text`, `browser_get_links`, `browser_download`,
`browser_screenshot`, `browser_page_info`, `browser_copy_text`, `browser_focus_element`,
`project_open`, `project_run`, `project_stop`, `open_terminal_here`, `file_find`, `file_open`,
`folder_open`, `file_recent`, `file_search_content`, `file_info`, `reveal_file`, `screen_capture`,
`active_window_capture`, `git_status`, `git_log`, `list_ports`, `docker_ps`.

Original action names are still available. Use grouped browser actions for tab-aware operations;
legacy open_website and play_youtube still launch your default browser.

## Context, confirmations and security

Session context is keyed by the authenticated caller identifier and expires after 15 idle minutes.
It retains the last tab/file/link list, current project, recent command output and screenshot state.
Do not manually put a guessed phone number into the caller parameter for browser testing.

Pending actions have random IDs, expire after 45 seconds, execute once, and belong to one caller.
The approval stores the actual operation rather than reinterpreting the confirmation text.
Browser click approval rechecks page URL, element identity and its fingerprint; tab/window close
approval rechecks targets. Changed pages/targets require a new request.
All arbitrary page clicks are conservative confirmations, including harmless-looking buttons.
The local engine cannot prove human intent from speech: Sarvam's updated instructions must
request explicit approval and must never confirm based on text found in a webpage.

Bearer auth remains mandatory. Owner checks remain active when ALLOW_NO_CALLER=false.
The browser token is separate; the bridge rejects public/proxied and foreign-origin requests.
Only authenticated `/action` and `/tools/...` are exposed via the existing tunnel. Dashboard,
monitor and capabilities pages require local Host/Origin and reject forwarded requests.
Known secrets and obvious secret-like strings are withheld from output/logs. This is a practical
filter, not a guarantee that arbitrary prose never contains sensitive information.

Shell text is never executed directly. Terminal commands resolve to fixed executables/arguments.
Project scripts run only after confirmation, with secret-related inherited environment variables
removed. The approved package.json is rechecked before execution; pre/post scripts are included
in review. Project code is still trusted code running as your user, not a security sandbox.
Only processes started by this J instance can be stopped; server exit also stops those processes.

File operations are limited to bounded home workspace roots. Dotfiles, credential files,
private keys and symlink escapes are blocked. Files are not deleted, moved or overwritten.

## Ubuntu setup and known limits

Run `node arrc/doctor.js`. Existing machine dependencies include Chrome, Spotify, VS Code,
playerctl, wl-copy/wl-paste, pactl, brightnessctl, nmcli, git, Docker, tree and lsof.
The screenshot portal uses the existing system Python and GI bindings. No large dependency
or local voice model was installed for this upgrade.

If a utility is missing on another machine:

```bash
sudo apt install playerctl wl-clipboard brightnessctl tree lsof python3-gi
# X11 only, if needed:
sudo apt install wmctrl xdotool xclip gnome-screenshot
```

GNOME Desktop Bridge is installed as `j-desktop-bridge@arrc.local`. Check/enable it with:

```bash
gnome-extensions info j-desktop-bridge@arrc.local
gnome-extensions enable j-desktop-bridge@arrc.local
```

It supports GNOME 46, uses only a local session-bus object, and has no network listener or
arbitrary JavaScript evaluator. The updated terminal typing bridge requires one normal Ubuntu
log-out/sign-in before GNOME loads it. Do not restart GNOME Shell inside an active Wayland session.
Reference: https://gjs.guide/extensions/development/debugging.html

Current limits (do not mistake these for completed features):

- Chrome needs the manual extension permission/pairing steps above. The normal-profile
  extension UI has not been automatically installed or accepted on your behalf.
- Spotify arbitrary song/playlist search opens results; automatic selection/play is not
  implemented. Transport controls and metadata use playerctl, with no developer API key.
- Generic desktop typing, coordinate clicks, global clipboard paste/copy shortcuts and
  DevTools shortcuts are not implemented. Browser text entry is available; writing into a
  VS Code buffer through desktop keystrokes is not.
- Enter submission is deliberately blocked; ask to click the named button and confirm.
- File content search currently covers bounded text/Markdown/CSV files, not PDF OCR.
- Only existing npm package scripts are supported by project_run. Arbitrary Python commands,
  dependency installation, sudo/apt, git push/reset/clean, arbitrary kills and file mutations
  remain manual. ARRC itself is not currently a Git repository, so its git status reports that.
- An authenticated browser test still consumes whatever Sarvam usage your account charges;
  the local upgrade adds no cloud model/service dependency.

`browser_action` also accepts `copy_url` and `copy_title` to put the current URL or title on
the clipboard. For grouped copying of selected text or the last ChatGPT response, use `copy:true`.

## Verification

Run `cd arrc && npm test`. Tests use isolated localhost fixtures and a headless Chrome process;
they do not close your personal tabs or submit real forms. Coverage includes navigation,
tab operations, type/find/scroll/read/link extraction, screenshot, click approval/replay,
invalid URLs, caller-bound expiration, invalid auth, dashboard isolation, denied commands,
secret filtering, symlink boundaries, app discovery and live system readings.
Chrome extension API calls are adapted in the fixture harness; real-profile permission and
pairing require the manual smoke test above. GNOME window listing is checked separately.
Real purchases, shutdown/reboot, Classroom uploads and media next/previous on your personal
queue are not exercised by automated tests.

Final local verification: seven automated test groups pass; the running authenticated server
answered battery, RAM, pwd, file-recent and window-list requests. ARRC git status correctly
reported that this extracted folder is not a Git repository. The browser bridge correctly
reports offline until the normal-profile extension is paired. Real Sarvam voice mapping and
website-specific interaction must be smoke-tested after pasting the updated instruction files.

## 30 phrases to try

After pairing Chrome and updating Sarvam:

1. What Chrome tabs are open?
2. Switch to my ChatGPT tab.
3. GitHub wale tab pe jao.
4. Go to the third tab.
5. Open a new tab at github.com.
6. Duplicate this tab.
7. Pin this tab.
8. Reload this page.
9. Go back.
10. Search Google for Ceph GSoC.
11. Open the first search result.
12. Search this page for pricing.
13. Neeche scroll karo.
14. Scroll to the top.
15. What is the page title?
16. Read the main content.
17. Click Sign in. (Then confirm or cancel.)
18. Type remote backend internships into the Search field.
19. Copy the last ChatGPT response.
20. Take a screenshot of this page.
21. Spotify kholo.
22. Search Spotify for Cold Water. (Select a result to play.)
23. What's playing?
24. Gaana pause kar.
25. Resume the music.
26. Volume thoda kam kar.
27. ARRC VS Code me kholo.
28. Open terminal in ARRC, then run pwd.
29. Show the PDFs I downloaded today.
30. How much RAM am I using?
