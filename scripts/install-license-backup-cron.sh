#!/usr/bin/env bash
# Install a daily systemd timer for license store backups (scripts/backup-licenses.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./lib.sh
source "$ROOT/scripts/lib.sh"

if [[ "$(id -u)" -ne 0 ]]; then
  fail "Run as root (sudo)"
fi

UNIT_DIR=/etc/systemd/system
cat >"$UNIT_DIR/guartrix-licenses-backup.service" <<EOF
[Unit]
Description=Guartrix license store backup
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${ROOT}
ExecStart=/bin/bash ${ROOT}/scripts/backup-licenses.sh
Nice=10
EOF

cat >"$UNIT_DIR/guartrix-licenses-backup.timer" <<EOF
[Unit]
Description=Daily Guartrix license store backup

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=900

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now guartrix-licenses-backup.timer
info "Installed guartrix-licenses-backup.timer (daily ~03:30)"
systemctl list-timers --all | grep -F guartrix-licenses-backup || true
