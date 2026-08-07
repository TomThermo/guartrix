#!/usr/bin/env bash
# Panel DB restore drill helper (staging only — never point at production blindly).
# Usage:
#   bash scripts/sla-restore-drill.sh
#   bash scripts/sla-restore-drill.sh --backup-only
#   bash scripts/sla-restore-drill.sh --restore-latest   # needs docker MySQL root or STAGING grants
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./lib.sh
if [[ -f "$ROOT/scripts/lib.sh" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/lib.sh"
fi

echo "[sla-restore-drill] 1) Create a fresh panel DB backup"
if [[ -x "$ROOT/scripts/backup-panel-db.sh" ]]; then
  # shellcheck disable=SC1091
  set -a
  [[ -f "$ROOT/.env" ]] && source "$ROOT/.env"
  set +a
  bash "$ROOT/scripts/backup-panel-db.sh"
else
  echo "  Missing scripts/backup-panel-db.sh" >&2
  exit 1
fi

if [[ "${1:-}" == "--backup-only" ]]; then
  echo "[sla-restore-drill] Backup-only mode done."
  exit 0
fi

LATEST="$(ls -1t "$ROOT"/data/backups/panel/guartrix_panel_*.sql.gz 2>/dev/null | head -1 || true)"
echo "[sla-restore-drill] 2) Latest backup: ${LATEST:-"(none)"}"
if [[ -z "${LATEST}" ]]; then
  echo "No backup artifact found" >&2
  exit 1
fi

if [[ "${1:-}" != "--restore-latest" ]]; then
  cat <<'EOF'

[sla-restore-drill] Checklist:
  [ ] Backup artifact retained under data/backups/panel/
  [ ] Restore to a staging MySQL (not production), e.g.:
        bash scripts/sla-restore-drill.sh --restore-latest
      or with an explicit DSN:
        STAGING_DATABASE_URL='mysql://…/guartrix_panel_staging' bash scripts/sla-restore-drill.sh --restore-latest
  [ ] Confirm staging table count / User rows
  [ ] Record date in Admin → Settings → Go-live → restore drill
  [ ] See docs/wiki/sla-ops.md
EOF
  exit 0
fi

echo "[sla-restore-drill] 3) Restoring into staging…"
if [[ -n "${STAGING_DATABASE_URL:-}" ]]; then
  eval "$(
    DATABASE_URL="$STAGING_DATABASE_URL" node -e '
      const u = new URL(process.env.DATABASE_URL);
      const enc = (s) => JSON.stringify(s);
      console.log("DB_USER=" + enc(decodeURIComponent(u.username || "")));
      console.log("DB_PASS=" + enc(decodeURIComponent(u.password || "")));
      console.log("DB_HOST=" + enc(u.hostname || "127.0.0.1"));
      console.log("DB_PORT=" + enc(u.port || "3306"));
      console.log("DB_NAME=" + enc((u.pathname || "/").replace(/^\//, "").split("?")[0]));
    '
  )"
  MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`;"
  gunzip -c "$LATEST" | MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME"
  echo "[sla-restore-drill] Restored into $DB_NAME via STAGING_DATABASE_URL"
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'guartrix-dev-mysql'; then
  docker exec guartrix-dev-mysql mysql -uroot -proot -e \
    "CREATE DATABASE IF NOT EXISTS guartrix_panel_staging; GRANT ALL ON guartrix_panel_staging.* TO 'guartrix'@'%'; FLUSH PRIVILEGES;" \
    >/dev/null
  gunzip -c "$LATEST" | docker exec -i guartrix-dev-mysql mysql -uroot -proot guartrix_panel_staging
  COUNT="$(docker exec guartrix-dev-mysql mysql -uroot -proot -N -e \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='guartrix_panel_staging';")"
  echo "[sla-restore-drill] Restored into guartrix_panel_staging (tables=$COUNT)"
else
  echo "Set STAGING_DATABASE_URL or run against docker compose MySQL (guartrix-dev-mysql)" >&2
  exit 1
fi

echo
echo "[sla-restore-drill] Done. Attest the date under Admin → Go-live → restore drill."
