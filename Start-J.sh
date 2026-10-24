#!/usr/bin/env bash
# Ubuntu launcher for J. Run from a terminal and keep it open while J is in use.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/arrc"

# Avoid starting a second copy: it would fight the running J server for the
# dashboard and local browser-bridge ports, then print an alarming EADDRINUSE.
if command -v curl >/dev/null && curl -fsS --max-time 2 http://127.0.0.1:3710/health >/dev/null 2>&1; then
  echo "J is already running in another terminal."
  echo "Dashboard: http://localhost:3710"
  echo "Use that existing terminal, or press Ctrl+C there before starting J again."
  exit 0
fi

if ! command -v node >/dev/null; then
  echo "Node.js 20 or later is required. Install it, then run this again."
  exit 1
fi
if ! command -v cloudflared >/dev/null; then
  echo "cloudflared is required for the secure public tunnel."
  echo "Install it with: sudo apt install cloudflared"
  exit 1
fi
if [ ! -f .env ]; then
  read -r -p "Your mobile number with country code, digits only (example 919876543210): " owner_number
  node setup.js "$owner_number"
fi
node start.js
