#!/usr/bin/env bash
# Scale smoke / readiness check for Guartrix 1.1+ (100n/1000c ops checklist).
# Usage:
#   bash scripts/scale-smoke.sh
#   API_BASE=http://127.0.0.1:3001 DAEMON_BASE=http://127.0.0.1:8081 bash scripts/scale-smoke.sh
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3001}"
DAEMON_BASE="${DAEMON_BASE:-http://127.0.0.1:8081}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:8080}"
ROUNDS="${ROUNDS:-20}"

ok=0
fail=0

check() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  OK  $name"
    ok=$((ok + 1))
  else
    echo "  FAIL $name"
    fail=$((fail + 1))
  fi
}

echo "[scale-smoke] API=$API_BASE daemon=$DAEMON_BASE web=$WEB_BASE rounds=$ROUNDS"
echo

echo "== Health =="
check "API /api/health" curl -sf "$API_BASE/api/health"
check "API /api/ready" curl -sf "$API_BASE/api/ready"
check "Daemon /health" curl -sf "$DAEMON_BASE/health"
check "Daemon /ready" curl -sf "$DAEMON_BASE/ready"
check "Web→API proxy /api/health" curl -sf "$WEB_BASE/api/health"

echo
echo "== Burst GETs (read-poll budget) =="
burst_fail=0
for i in $(seq 1 "$ROUNDS"); do
  if ! curl -sf "$API_BASE/api/health" >/dev/null; then
    burst_fail=$((burst_fail + 1))
  fi
done
if [[ "$burst_fail" -eq 0 ]]; then
  echo "  OK  $ROUNDS × /api/health"
  ok=$((ok + 1))
else
  echo "  FAIL $burst_fail/$ROUNDS health bursts failed"
  fail=$((fail + 1))
fi

echo
echo "== Env hints (informational) =="
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set +u
  # do not source secrets loudly — just grep presence
  for key in REDIS_URL SESSION_STORE RATE_LIMIT_STORE API_SESSION_RATE_LIMIT API_SESSION_READ_RATE_LIMIT ACTIVITY_LOG_RETENTION_DAYS PRISMA_SLOW_MS; do
    if rg -n "^[# ]*$key=" .env >/dev/null 2>&1; then
      echo "  present  $key"
    else
      echo "  missing  $key (optional / see env-reference)"
    fi
  done
  set -u
else
  echo "  (no .env in cwd)"
fi

echo
echo "[scale-smoke] passed=$ok failed=$fail"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
echo "[scale-smoke] ready for operator load/pilot under strong hardware"
