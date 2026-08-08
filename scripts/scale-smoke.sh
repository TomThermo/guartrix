#!/usr/bin/env bash
# Scale smoke / readiness check for Guartrix 1.1+ (100n/1000c ops checklist).
# Usage:
#   bash scripts/scale-smoke.sh
#   API_BASE=http://127.0.0.1:3001 DAEMON_BASE=http://127.0.0.1:8081 bash scripts/scale-smoke.sh
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3001}"
DAEMON_BASE="${DAEMON_BASE:-http://127.0.0.1:8081}"
# Prefer WEB_PORT from .env (cloud/dev often 3080); fall back to :80 then :8080.
if [[ -z "${WEB_BASE:-}" && -f .env ]]; then
  WEB_PORT_ENV="$(rg -n '^WEB_PORT=' .env | head -1 | cut -d= -f2- | tr -d '\r' || true)"
  if [[ -n "${WEB_PORT_ENV}" ]]; then
    WEB_BASE="http://127.0.0.1:${WEB_PORT_ENV}"
  fi
fi
WEB_BASE="${WEB_BASE:-http://127.0.0.1:80}"
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
  for key in REDIS_URL SESSION_STORE RATE_LIMIT_STORE REQUIRE_REDIS_HA PANEL_HA TRANSFER_ALLOW_PANEL_STAGING API_OWNER_RATE_LIMIT JOBS_BULLMQ API_SESSION_RATE_LIMIT API_SESSION_READ_RATE_LIMIT ACTIVITY_WEBHOOK_URL ALERT_EMAIL METRICS_TOKEN; do
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
echo "== SaaS / HA probes =="
check "API /api/v1/health" curl -sf "$API_BASE/api/v1/health"
if [[ -n "${METRICS_TOKEN:-}" ]] || rg -n '^METRICS_TOKEN=.' .env >/dev/null 2>&1; then
  TOKEN="${METRICS_TOKEN:-}"
  if [[ -z "$TOKEN" && -f .env ]]; then
    TOKEN="$(rg -n '^METRICS_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '\r')"
  fi
  check "API /api/metrics (token)" curl -sf -H "Authorization: Bearer $TOKEN" "$API_BASE/api/metrics"
else
  check "API /api/metrics" curl -sf "$API_BASE/api/metrics"
fi

echo
echo "[scale-smoke] passed=$ok failed=$fail"
if [[ "$fail" -gt 0 ]]; then
  exit 1
fi
echo "[scale-smoke] ready for operator load/pilot under strong hardware"
