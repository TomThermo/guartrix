#!/usr/bin/env bash
# Build commercial release parts as separate .zip files, then one master zip.
# Publishes into data/downloads/ for https://$PUBLIC_HOST/download (password gate).
#
# Usage:
#   bash scripts/package-download-bundle.sh
#   bash scripts/package-download-bundle.sh --skip-build
#   bash scripts/package-download-bundle.sh --no-publish
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Sibling license-server checkout (outside this panel repo)
if [[ -z "${LICENSE_SERVER_HOME:-}" ]]; then
  LICENSE_SERVER_HOME="$(cd "$ROOT/../guartrix-license-server" 2>/dev/null && pwd || true)"
fi
if [[ -n "${LICENSE_SERVER_HOME:-}" ]]; then
  LICENSE_SERVER_HOME="$(cd "$LICENSE_SERVER_HOME" 2>/dev/null && pwd || echo "$LICENSE_SERVER_HOME")"
fi

SKIP_BUILD=0
PUBLISH=1
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-publish) PUBLISH=0 ;;
    -h|--help)
      echo "Usage: bash scripts/package-download-bundle.sh [--skip-build] [--no-publish]"
      exit 0
      ;;
  esac
done

command -v zip >/dev/null || {
  echo "[download] zip is required (apt install zip)" >&2
  exit 1
}

VERSION="$(node -p "require('./package.json').version" 2>/dev/null || true)"
if [[ -z "${VERSION}" || "${VERSION}" == "undefined" ]]; then
  VERSION="$(node -p "require('./apps/api/package.json').version")"
fi
STAMP="$(date -u +%Y%m%d)"
OUT_DIR="${ROOT}/dist-download"
PARTS="${OUT_DIR}/parts"
BUNDLE_NAME="guartrix-bundle-${VERSION}-${STAMP}"
BUNDLE_DIR="${OUT_DIR}/${BUNDLE_NAME}"
MASTER_ZIP="${OUT_DIR}/${BUNDLE_NAME}.zip"
PUBLISH_DIR="${ROOT}/data/downloads"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "[download] Ensuring deps…"
  npm install --silent

  echo "[download] Prisma client…"
  npm run db:generate -w @msm/api

  echo "[download] Typecheck…"
  npx tsc -p packages/shared --noEmit
  npx tsc -p packages/node-agent --noEmit
  npx tsc -p apps/api --noEmit
  npx tsc -p apps/daemon --noEmit
  npm run typecheck -w @msm/web

  echo "[download] Bundle + minify…"
  node scripts/esbuild-release.mjs all

  echo "[download] Vite web…"
  npm run build -w @msm/web
fi

for f in \
  apps/api/dist/index.js \
  apps/daemon/dist/index.js \
  apps/web/dist/index.html
do
  [[ -f "$ROOT/$f" ]] || {
    echo "[download] ERROR: missing $f — run without --skip-build" >&2
    exit 1
  }
done

# shellcheck source=./lib-stage-release.sh
GUARTRIX_SRC="$ROOT"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib-stage-release.sh"

echo "[download] Staging full panel tree (customer — no git/src/download/license-server)…"
FULL_STAGE="${OUT_DIR}/stage-full"
guartrix_stage_release_tree "$FULL_STAGE" customer

rm -rf "$PARTS" "$BUNDLE_DIR"
mkdir -p "$PARTS" "$BUNDLE_DIR"

echo "[download] Zipping parts…"

# --- api (minified dist + prisma + package.json) ---
API_STAGE="${OUT_DIR}/stage-api"
rm -rf "$API_STAGE"
mkdir -p "$API_STAGE/apps/api/dist" "$API_STAGE/apps/api/prisma"
cp "$ROOT/apps/api/package.json" "$API_STAGE/apps/api/"
cp -a "$ROOT/apps/api/dist/." "$API_STAGE/apps/api/dist/"
cp -a "$ROOT/apps/api/prisma/." "$API_STAGE/apps/api/prisma/"
cp "$ROOT/.env.example" "$API_STAGE/.env.example"
cat >"$API_STAGE/README.txt" <<EOF
Guartrix API ${VERSION}
=======================

This zip is the API process only (apps/api). Prefer guartrix-panel-*.zip for a
full install. Use this part when updating just the API on an existing panel host.

Env
---
  cp .env.example .env
  Edit at least:
    ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_HOST, PUBLIC_IP, PUBLIC_BASE_URL
    DATABASE_URL (MySQL)
    LICENSE_SERVER_URL=https://license.guartrix.com
    LICENSE_KEY=GTRX-…

Install / run
-------------
  # From a full panel tree that already has node_modules + prisma:
  npm install
  npm run db:generate -w @msm/api
  npm run db:push -w @msm/api
  # Or with the panel start script (recommended):
  bash scripts/start.sh

  API listens on API_PORT (default 3001). Keep it on loopback; prod-web proxies /api.
EOF
(
  cd "$API_STAGE"
  zip -qr "$PARTS/guartrix-api-${VERSION}.zip" .
)
echo "[download]   guartrix-api-${VERSION}.zip"

# --- web ---
WEB_STAGE="${OUT_DIR}/stage-web"
rm -rf "$WEB_STAGE"
mkdir -p "$WEB_STAGE/apps/web/dist"
cp "$ROOT/apps/web/package.json" "$WEB_STAGE/apps/web/"
cp -a "$ROOT/apps/web/dist/." "$WEB_STAGE/apps/web/dist/"
cp "$ROOT/.env.example" "$WEB_STAGE/.env.example"
cat >"$WEB_STAGE/README.txt" <<EOF
Guartrix Web UI ${VERSION}
==========================

Static Vite build (apps/web/dist). Prefer guartrix-panel-*.zip for a full install.

Env
---
  The UI itself is static files. prod-web.mjs reads the panel .env for ports/TLS:
  cp .env.example .env
  Set WEB_PORT / HTTPS_PORT / PUBLIC_HOST / TLS_* as needed.

Install / run
-------------
  Place apps/web/dist on a panel host that already has scripts/prod-web.mjs.
  Or replace apps/web/dist inside an existing panel tree, then:
  bash scripts/start.sh

  Players open https://\$PUBLIC_HOST/ — /api and /ws are proxied to the API.
EOF
(
  cd "$WEB_STAGE"
  zip -qr "$PARTS/guartrix-web-${VERSION}.zip" .
)

# --- daemon ---
DAEMON_STAGE="${OUT_DIR}/stage-daemon"
rm -rf "$DAEMON_STAGE"
mkdir -p "$DAEMON_STAGE/apps/daemon/dist" "$DAEMON_STAGE/scripts"
cp "$ROOT/apps/daemon/package.json" "$DAEMON_STAGE/apps/daemon/"
cp -a "$ROOT/apps/daemon/dist/." "$DAEMON_STAGE/apps/daemon/dist/"
[[ -f "$ROOT/scripts/install-daemon.sh" ]] && cp "$ROOT/scripts/install-daemon.sh" "$DAEMON_STAGE/scripts/"
cp "$ROOT/daemon.env.example" "$DAEMON_STAGE/daemon.env.example"
# Panel .env snippet relevant to remote nodes (token/ports) — full template helps operators
cp "$ROOT/.env.example" "$DAEMON_STAGE/panel.env.example"
cat >"$DAEMON_STAGE/README.txt" <<EOF
Guartrix Daemon ${VERSION}
==========================

Game node (Wings-style): Docker Minecraft containers, SFTP, firewall, MySQL helper.
Prefer the panel “Add node” wizard, or guartrix-panel-*.zip on the same host.

Env
---
  mkdir -p data
  cp daemon.env.example data/daemon.env
  Fill DAEMON_TOKEN and DAEMON_NODE_ID from Admin → System (node details).
  panel.env.example is the panel template (for reference / same-host installs).

Install / run
-------------
  # Recommended remote install (from the panel wizard, or):
  sudo bash scripts/install-daemon.sh \\
    --panel-url https://panel.example.com \\
    --token YOUR_DAEMON_TOKEN \\
    --node-id YOUR_NODE_ID \\
    --port 8081

  # Manual:
  export \$(grep -v '^#' data/daemon.env | xargs)
  node apps/daemon/dist/index.js

  Open firewall: DAEMON_PORT/tcp, SFTP_PORT/tcp, and game ports.
  In the panel, set the node FQDN/scheme/port so the panel can reach this daemon.
EOF
(
  cd "$DAEMON_STAGE"
  zip -qr "$PARTS/guartrix-daemon-${VERSION}.zip" .
)

# --- license-server (sibling checkout; operators only) ---
LIC_ZIP="$PARTS/guartrix-license-server-${VERSION}.zip"
LIC_ENV_SRC=""
if [[ -n "${LICENSE_SERVER_HOME:-}" && -d "$LICENSE_SERVER_HOME" ]]; then
  if [[ ! -f "$LICENSE_SERVER_HOME/dist/index.js" ]]; then
    echo "[download] WARN: $LICENSE_SERVER_HOME/dist/index.js missing — skipping license-server zip" >&2
  else
    LIC_STAGE="${OUT_DIR}/stage-license"
    rm -rf "$LIC_STAGE"
    mkdir -p "$LIC_STAGE/dist"
    cp "$LICENSE_SERVER_HOME/package.json" "$LIC_STAGE/"
    cp -a "$LICENSE_SERVER_HOME/dist/." "$LIC_STAGE/dist/"
    [[ -d "$LICENSE_SERVER_HOME/public" ]] && mkdir -p "$LIC_STAGE/public" && cp -a "$LICENSE_SERVER_HOME/public/." "$LIC_STAGE/public/"
    if [[ -f "$LICENSE_SERVER_HOME/license.env.example" ]]; then
      cp "$LICENSE_SERVER_HOME/license.env.example" "$LIC_STAGE/license.env.example"
      LIC_ENV_SRC="$LICENSE_SERVER_HOME/license.env.example"
    fi
    [[ -f "$LICENSE_SERVER_HOME/VERSION" ]] && cp "$LICENSE_SERVER_HOME/VERSION" "$LIC_STAGE/VERSION" || true
    cat >"$LIC_STAGE/README.txt" <<EOF
Guartrix License Server ${VERSION}
=================================

OPERATOR ONLY — not shipped inside the customer panel zip.
Standalone package (sibling of the panel repo: guartrix-license-server).
License API (:4040) + admin UI (:4041).

Env
---
  mkdir -p data
  cp license.env.example data/license.env
  Set LICENSE_ADMIN_SECRET (required, long random).
  Set LICENSE_SERVER_URL to the public URL panels will call
  (e.g. https://license.guartrix.com).

Install / run
-------------
  npm install   # if package.json deps are needed on this host
  node dist/index.js

  Or from the panel operator host (SKIP_LOCAL_LICENSE_SERVER=0):
  bash scripts/start.sh   # starts \$LICENSE_SERVER_HOME/dist/index.js

  Admin console: http://127.0.0.1:4041/ (SSH tunnel recommended).
  Panels need only LICENSE_SERVER_URL + LICENSE_KEY in their .env.
EOF
    (
      cd "$LIC_STAGE"
      zip -qr "$LIC_ZIP" .
    )
    echo "[download]   guartrix-license-server-${VERSION}.zip (from $LICENSE_SERVER_HOME)"
  fi
else
  echo "[download] WARN: LICENSE_SERVER_HOME not found — skipping guartrix-license-server zip" >&2
fi

# --- full panel (customer install) ---
# .env.example already staged + sanitized by guartrix_stage_release_tree (customer)
cat >"$FULL_STAGE/INSTALL.txt" <<EOF
Guartrix Panel ${VERSION} — install
===================================

1) Extract and enter this directory.

2) Env
   cp .env.example .env
   Edit .env:
     ADMIN_PASSWORD, SESSION_SECRET
     PUBLIC_HOST, PUBLIC_IP, PUBLIC_BASE_URL
     DATABASE_URL (MySQL)
     LICENSE_SERVER_URL=https://license.guartrix.com
     LICENSE_KEY=GTRX-…   (from Guartrix)

3) Install deps + database
   npm install
   npm run db:generate && npm run db:push

4) TLS (optional but recommended)
   Place Cloudflare Origin cert as cert/guartrix.com.crt + .key
   or set TLS_CERT_FILE / TLS_KEY_FILE in .env.

5) Start
   bash scripts/start.sh
   # or: bash start.sh if present at the tree root

6) Open https://\$PUBLIC_HOST/ and log in with ADMIN_PASSWORD.
   Activate the license under Admin → License.
   Local daemon: Admin → System (node URL / Test connection).

Docs: docs/wiki/install-panel.md , docs/wiki/env-reference.md
EOF
printf '%s\n' \
  "Guartrix Panel ${VERSION} (full release)" \
  "" \
  "See INSTALL.txt for step-by-step setup." \
  "Env template: .env.example → copy to .env" \
  "Set LICENSE_SERVER_URL=https://license.guartrix.com and your LICENSE_KEY." \
  >"$FULL_STAGE/DOWNLOAD-README.txt"
TMP_PANEL="${OUT_DIR}/guartrix-panel-${VERSION}"
rm -rf "$TMP_PANEL"
mv "$FULL_STAGE" "$TMP_PANEL"
(
  cd "$(dirname "$TMP_PANEL")"
  zip -qr "$PARTS/guartrix-panel-${VERSION}.zip" "$(basename "$TMP_PANEL")"
)
echo "[download]   guartrix-panel-${VERSION}.zip"

echo "[download] Assembling master zip…"
cp -a "$PARTS/." "$BUNDLE_DIR/"
cp -f "$ROOT/.env.example" "$BUNDLE_DIR/guartrix.env.example"
cp -f "$ROOT/daemon.env.example" "$BUNDLE_DIR/daemon.env.example"
if [[ -n "${LIC_ENV_SRC:-}" && -f "$LIC_ENV_SRC" ]]; then
  cp -f "$LIC_ENV_SRC" "$BUNDLE_DIR/license.env.example"
fi
cat >"$BUNDLE_DIR/README.txt" <<EOF
Guartrix download bundle ${VERSION} (${STAMP})
==============================================

Zips (each has its own README.txt + env template):
  guartrix-panel-${VERSION}.zip           Full customer panel — start here
  guartrix-api-${VERSION}.zip             API dist only (+ .env.example)
  guartrix-web-${VERSION}.zip             Web UI dist only (+ .env.example)
  guartrix-daemon-${VERSION}.zip          Daemon (+ daemon.env.example)
  guartrix-license-server-${VERSION}.zip  License server (OPERATORS ONLY; from sibling checkout)

Env templates (also listed on https://guartrix.com/download):
  guartrix.env.example    → panel .env
  daemon.env.example      → data/daemon.env on a node
  license.env.example     → data/license.env on the license host (ships with license-server package)

Recommended install (panel):
  unzip guartrix-panel-${VERSION}.zip
  cd guartrix-panel-${VERSION}
  # follow INSTALL.txt
  cp .env.example .env
  npm install
  npm run db:generate && npm run db:push
  bash scripts/start.sh
EOF

rm -f "$MASTER_ZIP"
(
  cd "$OUT_DIR"
  zip -qr "$MASTER_ZIP" "$BUNDLE_NAME"
)

BYTES="$(wc -c <"$MASTER_ZIP" | tr -d ' ')"
HR="$(numfmt --to=iec-i --suffix=B "$BYTES" 2>/dev/null || echo "${BYTES} bytes")"
echo "[download] Master: ${MASTER_ZIP} (${HR})"

MANIFEST_JSON="$(
  PARTS_DIR="$PARTS" \
  MASTER_PATH="$MASTER_ZIP" \
  MASTER_NAME="$(basename "$MASTER_ZIP")" \
  BUNDLE_VERSION="$VERSION" \
  BUNDLE_STAMP="$STAMP" \
  ROOT_DIR="$ROOT" \
  LIC_ENV_SRC="${LIC_ENV_SRC:-}" \
  node <<'NODE'
const fs = require("fs");
const path = require("path");
const partsDir = process.env.PARTS_DIR;
const root = process.env.ROOT_DIR;
const files = fs.readdirSync(partsDir).filter((f) => f.endsWith(".zip")).sort();
const parts = files.map((name) => {
  const st = fs.statSync(path.join(partsDir, name));
  return { name, bytes: st.size };
});
const masterStat = fs.statSync(process.env.MASTER_PATH);
const extras = [];
const panelEnv = path.join(root, ".env.example");
const daemonEnv = path.join(root, "daemon.env.example");
const licEnv = process.env.LIC_ENV_SRC || "";
if (fs.existsSync(panelEnv)) {
  extras.push({
    name: "guartrix.env.example",
    bytes: fs.statSync(panelEnv).size,
    label: "Panel .env.example",
  });
}
if (fs.existsSync(daemonEnv)) {
  extras.push({
    name: "daemon.env.example",
    bytes: fs.statSync(daemonEnv).size,
    label: "Daemon data/daemon.env.example",
  });
}
if (licEnv && fs.existsSync(licEnv)) {
  extras.push({
    name: "license.env.example",
    bytes: fs.statSync(licEnv).size,
    label: "License server license.env.example",
  });
}
console.log(
  JSON.stringify(
    {
      version: process.env.BUNDLE_VERSION,
      stamp: process.env.BUNDLE_STAMP,
      builtAt: new Date().toISOString(),
      master: { name: process.env.MASTER_NAME, bytes: masterStat.size },
      parts,
      extras,
    },
    null,
    2,
  ),
);
NODE
)"

if [[ "$PUBLISH" -eq 1 ]]; then
  echo "[download] Publishing → ${PUBLISH_DIR}"
  mkdir -p "$PUBLISH_DIR"
  # Keep previous bundles; refresh "current" copies
  cp -f "$MASTER_ZIP" "$PUBLISH_DIR/"
  cp -f "$PARTS"/*.zip "$PUBLISH_DIR/"
  # Env templates (also inside zips — listed separately on /download)
  cp -f "$ROOT/.env.example" "$PUBLISH_DIR/guartrix.env.example"
  [[ -n "${LIC_ENV_SRC:-}" && -f "$LIC_ENV_SRC" ]] && cp -f "$LIC_ENV_SRC" "$PUBLISH_DIR/license.env.example"
  [[ -f "$ROOT/daemon.env.example" ]] && cp -f "$ROOT/daemon.env.example" "$PUBLISH_DIR/daemon.env.example"
  printf '%s\n' "$MANIFEST_JSON" >"$PUBLISH_DIR/manifest.json"
  ln -sfn "$(basename "$MASTER_ZIP")" "$PUBLISH_DIR/guartrix-bundle-latest.zip"
  chmod 640 "$PUBLISH_DIR"/*.zip "$PUBLISH_DIR"/*.example "$PUBLISH_DIR/manifest.json" 2>/dev/null || true
  echo "[download] Live URL: https://${PUBLIC_HOST:-guartrix.com}/download"
  echo "[download] Set DOWNLOAD_PASSWORD in .env (restart web) if not already."
fi

echo "[download] Done."
