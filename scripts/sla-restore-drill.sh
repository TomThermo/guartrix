#!/usr/bin/env bash
# Panel DB restore drill helper (staging only — never point at production blindly).
# Usage:
#   bash scripts/sla-restore-drill.sh
#   STAGING_DATABASE_URL='mysql://…' bash scripts/sla-restore-drill.sh --restore-latest
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[sla-restore-drill] 1) Ensure a fresh backup exists (cron or manual)."
if [[ -x "$ROOT/scripts/backup-panel-db.sh" ]]; then
  bash "$ROOT/scripts/backup-panel-db.sh" || true
elif [[ -f "$ROOT/scripts/install-panel-backup-cron.sh" ]]; then
  echo "  See scripts/install-panel-backup-cron.sh for nightly backups."
fi

echo "[sla-restore-drill] 2) Pick a backup under data/backups/panel/ (or your operator path)."
LATEST="$(ls -1t "$ROOT"/data/backups/panel/*.sql.gz 2>/dev/null | head -1 || true)"
if [[ -z "${LATEST}" ]]; then
  LATEST="$(ls -1t "$ROOT"/data/backups/*.sql.gz 2>/dev/null | head -1 || true)"
fi
echo "  Latest candidate: ${LATEST:-"(none found)"}"

if [[ "${1:-}" == "--restore-latest" ]]; then
  if [[ -z "${STAGING_DATABASE_URL:-}" ]]; then
    echo "Set STAGING_DATABASE_URL to a non-production MySQL URL before --restore-latest" >&2
    exit 1
  fi
  if [[ -z "${LATEST}" ]]; then
    echo "No .sql.gz backup found to restore" >&2
    exit 1
  fi
  echo "[sla-restore-drill] 3) Restoring ${LATEST} into STAGING_DATABASE_URL…"
  gunzip -c "$LATEST" | mysql --protocol=tcp "$(echo "$STAGING_DATABASE_URL" | sed 's#mysql://##')" 2>/dev/null \
    || echo "  Tip: restore with your usual mysql client against the staging DSN, then:"
  echo "  DATABASE_URL=\$STAGING_DATABASE_URL npm run start -w @msm/api"
fi

echo
echo "[sla-restore-drill] Checklist:"
echo "  [ ] Backup artifact retained"
echo "  [ ] Staging API boots and login works"
echo "  [ ] Server list loads"
echo "  [ ] Record date in Admin → Settings → Go-live → restore drill"
echo "  [ ] See docs/wiki/sla-ops.md"
