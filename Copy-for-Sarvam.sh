#!/usr/bin/env bash
# Ubuntu helper: copies the values required while creating J in Sarvam.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

copy() {
  if command -v wl-copy >/dev/null; then wl-copy
  elif command -v xclip >/dev/null; then xclip -selection clipboard
  else
    echo "Clipboard helper unavailable. Install wl-clipboard (Wayland) or xclip (X11), then retry. No private value was printed." >&2
    return 1
  fi
}

get_value() {
  case "$1" in
    1) cat "$ROOT/J-agent/1-instructions-prompt.txt" ;;
    2) printf '%s' "Hey Boss, it's J. What can I do for you?" ;;
    3) cat "$ROOT/J-agent/2-tool-description.txt" ;;
    4) test -f "$ROOT/arrc/tunnel-url.txt" && tr -d '\r\n' < "$ROOT/arrc/tunnel-url.txt" || return 4 ;;
    5) test -f "$ROOT/arrc/.env" && sed -n 's/^JARVIS_TOKEN=//p' "$ROOT/arrc/.env" || return 5 ;;
    *) return 2 ;;
  esac
}

pick="${1:-}"
if [ -z "$pick" ]; then
  printf '%s\n' '1 Instructions' '2 Greeting text' '3 Tool description' '4 Tool URL' '5 Bearer token' '6 Lock J to your phone' '0 Close'
  read -r -p 'Your choice: ' pick
fi
case "$pick" in
  0|'') exit 0 ;;
  6)
    test -f "$ROOT/arrc/.env" || { echo 'Start J first.'; exit 1; }
    sed -i 's/^ALLOW_NO_CALLER=.*/ALLOW_NO_CALLER=false/' "$ROOT/arrc/.env"
    echo 'Done. J now only accepts calls from your phone.'
    ;;
  1|2|3|4|5)
    value="$(get_value "$pick")" || { echo 'That value is not ready yet. Start J first for the URL and token.'; exit 1; }
    printf '%s' "$value" | copy
    echo 'Copied. Paste it only into the matching Sarvam field.'
    ;;
  *) echo 'Choose 0 through 6.'; exit 1 ;;
esac
