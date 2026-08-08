#!/usr/bin/env bash
# Install a daily systemd timer for panel MySQL dumps (scripts/backup-panel-db.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=./lib.sh
source "$ROOT/scripts/lib.sh"

if [[ "$(id -u)" -ne 0 ]]; then
  fail "Run as root (sudo)"
fi

UNIT_DIR=/etc/systemd/system
cat >"$UNIT_DIR/guartrix-panel-db-backup.service" <<EOF
[Unit]
Description=Guartrix panel MySQL backup
After=network-online.target docker.service

[Service]
Type=oneshot
WorkingDirectory=${ROOT}
EnvironmentFile=${ROOT}/.env
ExecStart=/bin/bash ${ROOT}/scripts/backup-panel-db.sh
Nice=10
EOF

cat >"$UNIT_DIR/guartrix-panel-db-backup.timer" <<EOF
[Unit]
Description=Daily Guartrix panel DB backup

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=900

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now guartrix-panel-db-backup.timer
info "Installed guartrix-panel-db-backup.timer (daily ~03:15)"
systemctl list-timers --all | grep -F guartrix-panel-db-backup || true
