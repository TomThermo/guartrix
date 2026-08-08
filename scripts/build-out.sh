#!/usr/bin/env bash
# Build everything into ./build and make it startable from there.
#
#   bash scripts/build-out.sh
#   bash build/start.sh
#
# Options:
#   --skip-compile   reuse existing release dists (apps/*/dist)
#   --npm-install    run npm install inside build/ (self-contained; slower)
#   --no-link-runtime  do not symlink ../.env ../data ../cert
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_COMPILE=0
NPM_INSTALL=0
LINK_RUNTIME=1

for arg in "$@"; do
  case "$arg" in
    --skip-compile) SKIP_COMPILE=1 ;;
    --npm-install) NPM_INSTALL=1 ;;
    --no-link-runtime) LINK_RUNTIME=0 ;;
    -h|--help)
      echo "Usage: bash scripts/build-out.sh [--skip-compile] [--npm-install] [--no-link-runtime]"
      exit 0
      ;;
  esac
done

BUILD_DIR="$ROOT/build"

if [[ "$SKIP_COMPILE" -eq 0 ]]; then
  echo "[build-out] Prisma client…"
  npm run db:generate -w @msm/api

  echo "[build-out] Bundle + minify api / daemon…"
  node scripts/esbuild-release.mjs all

  echo "[build-out] Vite web…"
  npm run build -w @msm/web
else
  echo "[build-out] Skipping compile — using existing apps/*/dist"
fi

# shellcheck source=./lib-stage-release.sh
GUARTRIX_SRC="$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib-stage-release.sh"

echo "[build-out] Staging → ${BUILD_DIR}"
guartrix_stage_release_tree "$BUILD_DIR"

if [[ "$NPM_INSTALL" -eq 1 ]]; then
  echo "[build-out] npm install in build/…"
  (cd "$BUILD_DIR" && npm install --omit=dev)
  echo "[build-out] Prisma generate in build/…"
  (cd "$BUILD_DIR" && npm run db:generate -w @msm/api)
else
  # Reuse the source tree’s node_modules (fast local workflow)
  if [[ -d "$ROOT/node_modules" ]]; then
    ln -sfn ../node_modules "$BUILD_DIR/node_modules"
    echo "[build-out] Linked node_modules → ../node_modules"
  else
    echo "[build-out] WARN: no ../node_modules — run with --npm-install" >&2
  fi
fi

if [[ "$LINK_RUNTIME" -eq 1 ]]; then
  # Share live config/data/certs with the source checkout on this host.
  # Staging creates a real build/data/ (templates only). `ln -sfn TARGET DIR`
  # would nest DIR/data → TARGET if DIR already exists — remove first.
  link_runtime() {
    local name="$1" target="$2"
    local dest="$BUILD_DIR/$name"
    if [[ -L "$dest" || -e "$dest" ]]; then
      rm -rf "$dest"
    fi
    ln -sfn "$target" "$dest"
    echo "[build-out] Linked $name/ → $target"
  }
  [[ -e "$ROOT/.env" ]] && { rm -f "$BUILD_DIR/.env"; ln -sfn ../.env "$BUILD_DIR/.env"; echo "[build-out] Linked .env"; }
  [[ -d "$ROOT/data" ]] && link_runtime data ../data
  [[ -d "$ROOT/cert" ]] && link_runtime cert ../cert
else
  echo "[build-out] Skipped runtime links — copy .env.example → build/.env yourself"
fi

cat > "$BUILD_DIR/README-BUILD.md" <<EOF
# Guartrix build output

Compiled panel (minified). Start from this folder:

\`\`\`bash
bash start.sh
# or: npm start
\`\`\`

On the build machine, panel \`.env\`, \`data/\` and \`cert/\`
are symlinked to the repo root.

Config that belongs here:
- \`.env\` / \`.env.example\` — panel

For a portable copy: \`npm run package:release\` or
\`bash scripts/build-out.sh --npm-install --no-link-runtime\`.
EOF

echo
echo "[build-out] Ready: ${BUILD_DIR}"
echo "[build-out] Start:  bash build/start.sh"
echo "[build-out] Or:     cd build && bash start.sh"
