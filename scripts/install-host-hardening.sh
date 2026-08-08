#!/usr/bin/env bash
# Optional host hardening (run manually with sudo):
#   - remove public UFW rules for API :3001 and Vite :5173
#   - install logrotate for data/logs
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Installing logrotate config..."
sudo cp "$ROOT/scripts/logrotate-guartrix.conf" /etc/logrotate.d/guartrix
sudo chmod 644 /etc/logrotate.d/guartrix

echo "Removing public UFW rules for 3001 and 5173 (if present)..."
# Delete by rule comment/port — re-run status to confirm
while sudo ufw status numbered | grep -qE ' (3001|5173)/tcp '; do
  NUM=$(sudo ufw status numbered | grep -E ' (3001|5173)/tcp ' | head -1 | sed -n 's/^\[\s*\([0-9]\+\)\].*/\1/p')
  [[ -n "$NUM" ]] || break
  yes | sudo ufw delete "$NUM" >/dev/null
done

sudo ufw status numbered
echo "Done. Panel stays on 80/443; API stays on 127.0.0.1:3001."
