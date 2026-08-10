#!/usr/bin/env bash
# Capacity review drill (operator). Collects estate stats; optional Go-live attestation.
# Usage:
#   bash scripts/sla-capacity-review-drill.sh
#   bash scripts/sla-capacity-review-drill.sh --attest
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ATTEST=0
for arg in "$@"; do
  case "$arg" in
    --attest) ATTEST=1 ;;
    -h|--help)
      sed -n '2,6p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "[sla-capacity-review] Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

# shellcheck source=./lib.sh
source "$ROOT/scripts/lib.sh"

echo "[sla-capacity-review] Estate snapshot ($(date -u +%Y-%m-%d))"

DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "  [warn] DATABASE_URL not set — skip DB counts" >&2
else
  eval "$(
    node -e '
      const u = new URL(process.env.DATABASE_URL);
      const enc = (s) => JSON.stringify(s);
      console.log("DB_USER=" + enc(decodeURIComponent(u.username || "")));
      console.log("DB_PASS=" + enc(decodeURIComponent(u.password || "")));
      console.log("DB_HOST=" + enc(u.hostname || "127.0.0.1"));
      console.log("DB_PORT=" + enc(u.port || "3306"));
      console.log("DB_NAME=" + enc((u.pathname || "/").replace(/^\//, "").split("?")[0]));
    '
  )"
  MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -N -e "
    SELECT CONCAT('  nodes=', COUNT(*)) FROM \`Node\`;
    SELECT CONCAT('  servers=', COUNT(*)) FROM \`Server\`;
    SELECT CONCAT('  users=', COUNT(*)) FROM \`User\`;
    SELECT CONCAT('  db_mb=', ROUND(COALESCE(SUM(data_length+index_length),0)/1024/1024, 1))
      FROM information_schema.tables WHERE table_schema='${DB_NAME}';
  " "$DB_NAME" 2>/dev/null || {
    echo "  [warn] Could not query MySQL counts (check DATABASE_URL + mysql client)" >&2
  }
fi

if command -v redis-cli >/dev/null 2>&1 && [[ -n "${REDIS_URL:-}" ]]; then
  redis-cli -u "$REDIS_URL" INFO memory 2>/dev/null | grep -E '^used_memory_human:' | sed 's/^/  redis_/' || true
fi

cat <<'EOF'

[sla-capacity-review] Checklist:
  [ ] Node CPU/RAM headroom vs scheduled servers
  [ ] MySQL disk + backup retention
  [ ] Redis memory (when HA enabled)
  [ ] Review scaling.md / scale roadmap assumptions
  [ ] Record date: Admin → Go-live → capacity review, or --attest
EOF

if [[ "$ATTEST" -eq 1 ]]; then
  ROOT="$ROOT" DATA_DIR="$ROOT/data" node "$ROOT/scripts/lib/panel-settings-attest.mjs" slaCapacityReviewAt
  echo "[sla-capacity-review] Attestation saved — Admin → Settings → Go-live."
fi
