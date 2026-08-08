#!/usr/bin/env bash
# Dump the panel MySQL database (guartrix_panel) to data/backups/panel/
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./lib.sh
source "$ROOT/scripts/lib.sh"

OUT_DIR="$ROOT/data/backups/panel"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/guartrix_panel_${STAMP}.sql.gz"

DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" ]]; then
  fail "DATABASE_URL is not set"
fi

# Parse mysql://user:pass@host:port/db with URL-decoding (handles @ : % in password)
eval "$(
  node -e '
    try {
      const u = new URL(process.env.DATABASE_URL);
      if (u.protocol !== "mysql:") process.exit(2);
      const enc = (s) => JSON.stringify(s);
      console.log("DB_USER=" + enc(decodeURIComponent(u.username || "")));
      console.log("DB_PASS=" + enc(decodeURIComponent(u.password || "")));
      console.log("DB_HOST=" + enc(u.hostname || "127.0.0.1"));
      console.log("DB_PORT=" + enc(u.port || "3306"));
      console.log("DB_NAME=" + enc((u.pathname || "/").replace(/^\//, "").split("?")[0]));
    } catch (e) {
      process.exit(1);
    }
  '
)" || fail "Could not parse DATABASE_URL"

info "Backing up ${DB_NAME} → ${OUT}"
if command -v mysqldump >/dev/null 2>&1; then
  MYSQL_PWD="$DB_PASS" mysqldump \
    -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
    --single-transaction --routines --triggers --no-tablespaces \
    "$DB_NAME" | gzip -c >"$OUT"
else
  # Fall back to Docker exec into guartrix-mysql
  sudo -n docker exec -e MYSQL_PWD="$DB_PASS" guartrix-mysql \
    mysqldump -u "$DB_USER" --single-transaction --routines --triggers --no-tablespaces "$DB_NAME" \
    | gzip -c >"$OUT"
fi
chmod 600 "$OUT"
info "Panel DB backup OK ($(du -h "$OUT" | awk '{print $1}'))"

# Keep last 14 dumps
ls -1t "$OUT_DIR"/guartrix_panel_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
