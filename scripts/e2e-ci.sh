#!/usr/bin/env bash
# CI / local: MySQL → migrate → build → start panel → Playwright smoke.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export ADMIN_PASSWORD="${ADMIN_PASSWORD:-changeme}"
export SESSION_SECRET="${SESSION_SECRET:-e2e-session-secret-xxxxxxxxxxxx}"
export ALLOW_INSECURE_DEFAULTS="${ALLOW_INSECURE_DEFAULTS:-1}"
export DATABASE_URL="${DATABASE_URL:-mysql://guartrix:guartrix@127.0.0.1:3306/guartrix_panel}"
export HTTPS_ENABLED="${HTTPS_ENABLED:-false}"
export SESSION_SECURE="${SESSION_SECURE:-false}"
export WEB_PORT="${WEB_PORT:-8080}"
export API_PORT="${API_PORT:-3001}"
export PUBLIC_HOST="${PUBLIC_HOST:-127.0.0.1}"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://127.0.0.1:8080}"
export NO_MONITOR="${NO_MONITOR:-1}"
export REDIS_ENABLED="${REDIS_ENABLED:-0}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:${WEB_PORT}}"

echo "[e2e] Starting MySQL (docker compose)…"
docker compose -f docker-compose.dev.yml up -d mysql
for _ in $(seq 1 40); do
  if docker compose -f docker-compose.dev.yml exec -T mysql mysqladmin ping -h127.0.0.1 -uroot -proot --silent 2>/dev/null; then
    break
  fi
  sleep 1
done

echo "[e2e] Migrate + build…"
npm run db:generate
bash scripts/db-migrate.sh
npm run build
if [[ -f scripts/esbuild-release.mjs ]]; then
  node scripts/esbuild-release.mjs all
fi

echo "[e2e] Start panel…"
bash scripts/start.sh &
START_PID=$!
trap 'kill "$START_PID" 2>/dev/null || true' EXIT

bash scripts/wait-panel-health.sh 90

echo "[e2e] Playwright smoke…"
npx playwright test --config e2e/playwright.config.ts

echo "[e2e] OK"
