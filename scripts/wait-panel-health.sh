#!/usr/bin/env bash
# Wait until API + web respond (used by e2e-ci and operators).
set -euo pipefail

API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-80}"
API_HOST="${API_HOST:-127.0.0.1}"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
TRIES="${1:-60}"

for _ in $(seq 1 "$TRIES"); do
  api_ok=0
  web_ok=0
  curl -sf "http://${API_HOST}:${API_PORT}/api/health" >/dev/null 2>&1 && api_ok=1
  curl -sf "http://${WEB_HOST}:${WEB_PORT}/" >/dev/null 2>&1 && web_ok=1
  if [[ "$api_ok" -eq 1 && "$web_ok" -eq 1 ]]; then
    echo "[guartrix] Panel healthy (API :${API_PORT}, web :${WEB_PORT})"
    exit 0
  fi
  sleep 1
done

echo "[guartrix] ERROR: Panel did not become healthy within ${TRIES}s" >&2
exit 1
