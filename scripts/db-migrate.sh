#!/usr/bin/env bash
# Apply Prisma migrations (preferred over `db push` for installs + upgrades).
#
# Fresh DB: `prisma migrate deploy` creates tables from migration history.
# Legacy hosts that only ever used `db push`: if CREATE fails because tables
# already exist, baseline the init migration then deploy again.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- || true)"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi
export DATABASE_URL

if [[ ! -e apps/api/.env && -f .env ]]; then
  ln -sfn ../../.env apps/api/.env
fi

INIT_MIGRATION="20260803120000_init"
SCHEMA="apps/api/prisma/schema.prisma"
ERR_FILE="$(mktemp)"
trap 'rm -f "$ERR_FILE"' EXIT

echo "[guartrix] Applying database migrations (prisma migrate deploy)…"
set +e
npm run db:migrate -w @msm/api >"$ERR_FILE" 2>&1
RC=$?
set -e
cat "$ERR_FILE"

if [[ "$RC" -eq 0 ]]; then
  exit 0
fi

if grep -qiE 'already exists|P3005|P3018|Database schema is not empty' "$ERR_FILE"; then
  echo "[guartrix] Legacy db-push database detected — baselining ${INIT_MIGRATION}…"
  npx prisma migrate resolve --applied "$INIT_MIGRATION" --schema "$SCHEMA"
  npm run db:migrate -w @msm/api
  exit 0
fi

echo "ERROR: prisma migrate deploy failed." >&2
exit 1
