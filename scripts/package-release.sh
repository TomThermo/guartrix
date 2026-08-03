#!/usr/bin/env bash
# Build a commercial release tarball: minified bundles, no TypeScript sources.
#
# Output: dist-release/guartrix-<version>-<date>.tar.gz
#
# Usage:
#   bash scripts/package-release.sh
#   bash scripts/package-release.sh --skip-build   # pack existing release dists
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      echo "Usage: bash scripts/package-release.sh [--skip-build]"
      exit 0
      ;;
  esac
done

VERSION="$(node -p "require('./package.json').version" 2>/dev/null || true)"
if [[ -z "${VERSION}" || "${VERSION}" == "undefined" ]]; then
  VERSION="$(node -p "require('./apps/api/package.json').version")"
fi
STAMP="$(date -u +%Y%m%d)"
NAME="guartrix-${VERSION}-${STAMP}"
OUT_DIR="${ROOT}/dist-release"
STAGE="${OUT_DIR}/${NAME}"
ARCHIVE="${OUT_DIR}/${NAME}.tar.gz"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "[release] Ensuring deps…"
  npm install --silent

  echo "[release] Prisma client…"
  npm run db:generate -w @msm/api

  echo "[release] Typecheck (tsc --noEmit)…"
  npx tsc -p packages/shared --noEmit
  npx tsc -p packages/node-agent --noEmit
  npx tsc -p apps/api --noEmit
  npx tsc -p apps/daemon --noEmit
  npm run typecheck -w @msm/web

  echo "[release] Bundle + minify api / daemon…"
  node scripts/esbuild-release.mjs all

  echo "[release] Vite web build…"
  npm run build -w @msm/web
fi

# shellcheck source=./lib-stage-release.sh
GUARTRIX_SRC="$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib-stage-release.sh"

echo "[release] Staging ${NAME} (customer)…"
guartrix_stage_release_tree "$STAGE" customer

echo "[release] Creating ${ARCHIVE}…"
mkdir -p "$OUT_DIR"
tar -C "$OUT_DIR" -czf "$ARCHIVE" "$NAME"

BYTES="$(wc -c < "$ARCHIVE" | tr -d ' ')"
HR="$(numfmt --to=iec-i --suffix=B "$BYTES" 2>/dev/null || echo "${BYTES} bytes")"
echo "[release] Done: ${ARCHIVE} (${HR})"
echo "[release] Stage dir: ${STAGE}"
echo "[release] Install: extract → cp .env.example .env → npm install → npm run db:generate && bash scripts/db-migrate.sh → bash start.sh"
