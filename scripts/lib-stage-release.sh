#!/usr/bin/env bash
# Stage a runnable release tree (no TypeScript sources) into $1.
# Expects release bundles already built under $GUARTRIX_SRC (repo root).
#
# Usage (from another script):
#   GUARTRIX_SRC=/path/to/repo
#   source scripts/lib-stage-release.sh
#   guartrix_stage_release_tree /path/to/dest           # full panel (no license-server)
#   guartrix_stage_release_tree /path/to/dest customer  # customer panel zip (no git/src/download/license-server)

guartrix_stage_release_tree() {
  local STAGE="$1"
  local MODE="${2:-full}"
  local ROOT="${GUARTRIX_SRC:-}"
  if [[ -z "$ROOT" ]]; then
    echo "[guartrix] GUARTRIX_SRC is required" >&2
    return 1
  fi
  if [[ -z "$STAGE" ]]; then
    echo "[guartrix] stage destination required" >&2
    return 1
  fi

  for f in \
    apps/api/dist/index.js \
    apps/api/dist/bot-worker-main.js \
    apps/daemon/dist/index.js \
    apps/web/dist/index.html
  do
    [[ -f "$ROOT/$f" ]] || {
      echo "[guartrix] ERROR: missing $f — run build:release first" >&2
      return 1
    }
  done

  rm -rf "$STAGE"
  mkdir -p "$STAGE"

  cp "$ROOT/package.json" "$STAGE/"
  cp "$ROOT/package-lock.json" "$STAGE/"
  cp "$ROOT/.env.example" "$STAGE/"
  mkdir -p "$STAGE/data/licenses"
  [[ -f "$ROOT/data/daemon.env.example" ]] && cp "$ROOT/data/daemon.env.example" "$STAGE/data/"
  # Ed25519 verify key — required for signed license responses on customer installs.
  # Never ship signing-private.pem / licenses.json.
  if [[ -f "$ROOT/data/licenses/signing-public.pem" ]]; then
    cp "$ROOT/data/licenses/signing-public.pem" "$STAGE/data/licenses/signing-public.pem"
    chmod 644 "$STAGE/data/licenses/signing-public.pem"
  else
    echo "[guartrix] ERROR: missing data/licenses/signing-public.pem — customer panels cannot verify licenses" >&2
    return 1
  fi
  [[ -f "$ROOT/VERSION" ]] && cp "$ROOT/VERSION" "$STAGE/"
  cp "$ROOT/README.md" "$STAGE/"
  [[ -f "$ROOT/LICENSE" ]] && cp "$ROOT/LICENSE" "$STAGE/" || true

  mkdir -p "$STAGE/scripts"
  for s in \
    start.sh start-prod.mjs prod-web.mjs lib.sh monitor.sh \
    install.sh install-panel.sh install-daemon.sh \
    install-host-hardening.sh \
    backup-panel-db.sh install-panel-backup-cron.sh \
    db-migrate.sh
  do
    [[ -f "$ROOT/scripts/$s" ]] && cp "$ROOT/scripts/$s" "$STAGE/scripts/"
  done
  if [[ -d "$ROOT/scripts/prod-web" ]]; then
    mkdir -p "$STAGE/scripts/prod-web"
    cp -a "$ROOT/scripts/prod-web/." "$STAGE/scripts/prod-web/"
  fi
  [[ -f "$ROOT/scripts/logrotate-guartrix.conf" ]] && cp "$ROOT/scripts/logrotate-guartrix.conf" "$STAGE/scripts/"
  # Operator download gate must NEVER be copied into staged releases.
  # Live operator host keeps scripts/prod-web-download.mjs beside prod-web.mjs.
  chmod +x "$STAGE"/scripts/*.sh 2>/dev/null || true

  mkdir -p "$STAGE/docs/wiki"
  cp -a "$ROOT/docs/wiki/." "$STAGE/docs/wiki/" 2>/dev/null || true
  [[ -f "$ROOT/docs/roadmap.md" ]] && cp "$ROOT/docs/roadmap.md" "$STAGE/docs/" || true
  [[ -f "$ROOT/docs/openapi.yaml" ]] && cp "$ROOT/docs/openapi.yaml" "$STAGE/docs/" || true

  local app
  for app in api daemon web; do
    mkdir -p "$STAGE/apps/$app/dist"
    cp "$ROOT/apps/$app/package.json" "$STAGE/apps/$app/"
    cp -a "$ROOT/apps/$app/dist/." "$STAGE/apps/$app/dist/"
  done

  mkdir -p "$STAGE/apps/api/prisma"
  # Schema only — never ship local sqlite backups or generated DBs
  cp "$ROOT/apps/api/prisma/schema.prisma" "$STAGE/apps/api/prisma/"
  find "$ROOT/apps/api/prisma" -maxdepth 1 -name 'migrations' -type d -exec cp -a {} "$STAGE/apps/api/prisma/" \; 2>/dev/null || true
  find "$STAGE/apps/api/prisma" \( -name '*.db' -o -name '*sqlite*' -o -name '*.db-journal' \) -delete 2>/dev/null || true

  local pkg
  for pkg in shared node-agent; do
    mkdir -p "$STAGE/packages/$pkg/dist"
    cp "$ROOT/packages/$pkg/package.json" "$STAGE/packages/$pkg/"
    echo 'export {};' > "$STAGE/packages/$pkg/dist/index.js"
    if [[ "$pkg" == "shared" ]]; then
      echo 'export {};' > "$STAGE/packages/$pkg/dist/daemon-jwt.js"
      echo 'export {};' > "$STAGE/packages/$pkg/dist/license-signing.js"
    fi
  done

  export STAGE
  node <<'NODE'
const fs = require("fs");
const path = require("path");
const stage = process.env.STAGE;
const rootPkg = JSON.parse(fs.readFileSync(path.join(stage, "package.json"), "utf8"));
rootPkg.scripts = {
  ...rootPkg.scripts,
  build:
    "node -e \"const fs=require('fs'); for (const f of ['apps/api/dist/index.js','apps/api/dist/bot-worker-main.js','apps/daemon/dist/index.js','apps/web/dist/index.html']) { if (!fs.existsSync(f)) { console.error('[guartrix] Missing '+f); process.exit(1);} } console.log('[guartrix] Prebuilt release OK');\"" ,
  "build:release": "npm run build",
  "build:dev": "echo 'Source tree not included in this build output' && exit 1",
  "build:out": "echo 'Not available in release package' && exit 1",
  "package:release": "echo 'Not available in release package' && exit 1",
  "package:download": "echo 'Not available in release package' && exit 1",
  start: "bash start.sh",
};
fs.writeFileSync(path.join(stage, "package.json"), JSON.stringify(rootPkg, null, 2) + "\n");

for (const app of ["api", "daemon"]) {
  const p = path.join(stage, "apps", app, "package.json");
  if (!fs.existsSync(p)) continue;
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  pkg.scripts = {
    ...pkg.scripts,
    build: "node -e \"require('fs').accessSync('dist/index.js')\"",
    "build:dev": "echo 'No TypeScript sources in build output' && exit 1",
    "build:release": "npm run build",
  };
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
}
NODE

  find "$STAGE" \( -name '*.ts' -o -name '*.tsx' \) ! -path '*/prisma/*' -delete 2>/dev/null || true
  find "$STAGE" -type d -name src -exec rm -rf {} + 2>/dev/null || true
  find "$STAGE" -name '*.map' -delete 2>/dev/null || true

  # API ships a second entry (Mineflayer bot worker). Daemon stays single-file.
  find "$STAGE/apps/daemon/dist" -type f ! -name 'index.js' -delete 2>/dev/null || true
  find "$STAGE/apps/api/dist" -type f ! \( -name 'index.js' -o -name 'bot-worker-main.js' \) -delete 2>/dev/null || true
  if [[ ! -f "$STAGE/apps/api/dist/bot-worker-main.js" ]]; then
    echo "[guartrix] ERROR: missing apps/api/dist/bot-worker-main.js" >&2
    return 1
  fi

  cat > "$STAGE/start.sh" <<'EOF'
#!/usr/bin/env bash
# Start Guartrix from this build directory.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash scripts/start.sh "$@"
EOF
  chmod +x "$STAGE/start.sh"

  cat > "$STAGE/STOP.md" <<'EOF'
# Stop

```bash
# Prefer restart via start.sh (it stops old processes first), or:
pkill -f 'apps/(api|daemon)/dist/index.js' || true
pkill -f 'scripts/monitor.sh' || true
pkill -f 'scripts/prod-web.mjs' || true
```
EOF

  if [[ "$MODE" == "customer" ]]; then
    guartrix_sanitize_customer_tree "$STAGE"
  fi

  guartrix_assert_release_clean "$STAGE" "$MODE"
}

# Customer panel package: no operator download gate, no license-server, no git/dev docs.
guartrix_sanitize_customer_tree() {
  local STAGE="$1"
  echo "[guartrix] Sanitizing customer release tree…"

  rm -f "$STAGE/scripts/prod-web-download.mjs"
  rm -f "$STAGE/scripts/package-download-bundle.sh"
  rm -f "$STAGE/scripts/package-release.sh"
  rm -f "$STAGE/scripts/build-out.sh"
  rm -f "$STAGE/scripts/esbuild-release.mjs"
  rm -f "$STAGE/scripts/lib-stage-release.sh"
  rm -f "$STAGE/scripts/install-license-le-cert.sh"
  rm -f "$STAGE/scripts/install-license-backup-cron.sh"
  rm -f "$STAGE/scripts/backup-licenses.sh"

  rm -rf "$STAGE/apps/license-server"
  rm -f "$STAGE/license.env.example"

  rm -f "$STAGE/docs/roadmap.md"
  rm -f "$STAGE/docs/wiki/development.md"
  rm -f "$STAGE/docs/wiki/release-builds.md"
  # Drop operator-only rows from env reference
  if [[ -f "$STAGE/docs/wiki/env-reference.md" ]]; then
    STAGE="$STAGE" node <<'NODE'
const fs = require("fs");
const path = require("path");
const file = path.join(process.env.STAGE, "docs/wiki/env-reference.md");
let text = fs.readFileSync(file, "utf8");
text = text
  .split(/\r?\n/)
  .filter((line) => {
    if (/DOWNLOAD_/i.test(line)) return false;
    if (/LETSENCRYPT_/i.test(line)) return false;
    if (/LICENSE_TLS_/i.test(line)) return false;
    if (/LICENSE_ALLOW_UNSIGNED/i.test(line)) return false;
    if (/install-license-le-cert/i.test(line)) return false;
    if (/package:download/i.test(line)) return false;
    return true;
  })
  .join("\n");
fs.writeFileSync(file, text.endsWith("\n") ? text : text + "\n");
NODE
  fi
  mkdir -p "$STAGE/docs/wiki"
  cat > "$STAGE/docs/wiki/licensing.md" <<'EOF'
# Licensing (customer)

Set in `.env`:

```bash
LICENSE_SERVER_URL=https://license.guartrix.com
LICENSE_KEY=GTRX-…
```

This package ships `data/licenses/signing-public.pem` so the panel can verify
signed responses from the license API. Activate the key under Admin → License.
Without a valid key the panel runs a free tier (1 node, 1 server, 10 GB disk).
Contact Guartrix for keys and quotas.
EOF

  if [[ -f "$STAGE/.env.example" ]]; then
    STAGE="$STAGE" node <<'NODE'
const fs = require("fs");
const path = require("path");
const file = path.join(process.env.STAGE, ".env.example");
let text = fs.readFileSync(file, "utf8");
text = text
  .split(/\r?\n/)
  .filter((line) => {
    const t = line.trim();
    if (/^#?\s*DOWNLOAD_/i.test(t)) return false;
    if (/Password-gated release downloads/i.test(t)) return false;
    if (/package:download/i.test(t)) return false;
    if (/install-license-le-cert/i.test(t)) return false;
    if (/^#?\s*LICENSE_TLS_/i.test(t)) return false;
    if (/^#?\s*LETSENCRYPT_/i.test(t)) return false;
    if (/^#?\s*LICENSE_SERVER_HOME/i.test(t)) return false;
    if (/^#?\s*SKIP_LOCAL_LICENSE_SERVER/i.test(t)) return false;
    if (/^#?\s*LICENSE_PUBLIC_HOST/i.test(t)) return false;
    if (/^#?\s*LICENSE_PROXY_/i.test(t)) return false;
    if (/^#?\s*LICENSE_ALLOW_UNSIGNED/i.test(t)) return false;
    if (/accept unsigned validate/i.test(t)) return false;
    if (/Emergency only: accept unsigned/i.test(t)) return false;
    if (/sibling guartrix-license-server/i.test(t)) return false;
    if (/SNI cert for DNS-only license/i.test(t)) return false;
    if (/sudo bash scripts\/install-license/i.test(t)) return false;
    return true;
  })
  .join("\n")
  .replace(/\n{3,}/g, "\n\n");
if (!/^LICENSE_SERVER_URL=/m.test(text)) {
  text += "\nLICENSE_SERVER_URL=https://license.guartrix.com\n";
}
fs.writeFileSync(file, text.endsWith("\n") ? text : text + "\n");
NODE
  fi

  STAGE="$STAGE" node <<'NODE'
const fs = require("fs");
const path = require("path");
const p = path.join(process.env.STAGE, "package.json");
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.scripts = pkg.scripts || {};
pkg.scripts.build =
  "node -e \"const fs=require('fs'); for (const f of ['apps/api/dist/index.js','apps/api/dist/bot-worker-main.js','apps/daemon/dist/index.js','apps/web/dist/index.html']) { if (!fs.existsSync(f)) { console.error('[guartrix] Missing '+f); process.exit(1);} } console.log('[guartrix] Prebuilt release OK');\"";
delete pkg.scripts["package:download"];
delete pkg.scripts["package:release"];
delete pkg.scripts["build:out"];
delete pkg.scripts["build:release"];
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
NODE

  cat > "$STAGE/STOP.md" <<'EOF'
# Stop

```bash
pkill -f 'apps/(api|daemon)/dist/index.js' || true
pkill -f 'scripts/monitor.sh' || true
pkill -f 'scripts/prod-web.mjs' || true
```
EOF
}

guartrix_assert_release_clean() {
  local STAGE="$1"
  local MODE="${2:-full}"
  local bad=0
  local hit

  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    echo "[guartrix] ERROR: forbidden path in release: $hit" >&2
    bad=1
  done < <(
    # Search by basename / relative path only — STAGE itself may live under dist-download/
    (
      cd "$STAGE" || exit 0
      find . \( \
        -name '.git' -o \
        -name '.env' -o \
        -name 'node_modules' -o \
        -name 'prod-web-download.mjs' -o \
        -name 'package-download-bundle.sh' -o \
        -name 'signing-private.pem' -o \
        -name 'download-password.txt' -o \
        -name 'licenses.json' -o \
        -path './data/downloads/*' -o \
        -path './.cursor/*' \
      \) 2>/dev/null
    )
  )

  if [[ "$MODE" == "customer" ]]; then
    if [[ -d "$STAGE/apps/license-server" ]]; then
      echo "[guartrix] ERROR: license-server must not be in customer panel zip" >&2
      bad=1
    fi
    if [[ -f "$STAGE/scripts/prod-web-download.mjs" ]]; then
      echo "[guartrix] ERROR: download gate must not be in customer zip" >&2
      bad=1
    fi
    if [[ ! -f "$STAGE/data/licenses/signing-public.pem" ]]; then
      echo "[guartrix] ERROR: customer zip must include data/licenses/signing-public.pem" >&2
      bad=1
    fi
    if [[ -f "$STAGE/.env.example" ]] && rg -n 'LICENSE_ALLOW_UNSIGNED|DOWNLOAD_PASSWORD' "$STAGE/.env.example" >/dev/null 2>&1; then
      echo "[guartrix] ERROR: customer .env.example still has operator-only license/download knobs" >&2
      rg -n 'LICENSE_ALLOW_UNSIGNED|DOWNLOAD_PASSWORD' "$STAGE/.env.example" >&2 || true
      bad=1
    fi
    if rg -l 'DOWNLOAD_PASSWORD|package-download-bundle\.sh' "$STAGE" 2>/dev/null | head -5 | grep -q .; then
      echo "[guartrix] ERROR: operator download strings found in customer tree" >&2
      rg -n 'DOWNLOAD_PASSWORD|package-download-bundle\.sh' "$STAGE" 2>/dev/null | head -10 >&2 || true
      bad=1
    fi
  fi

  if find "$STAGE" \( -name '*.ts' -o -name '*.tsx' \) ! -path '*/prisma/*' | grep -q .; then
    echo "[guartrix] ERROR: TypeScript sources found in release tree" >&2
    bad=1
  fi

  # Prisma/dev leftovers
  if find "$STAGE" -name '*.db' -o -name '*sqlite*' | grep -q .; then
    echo "[guartrix] ERROR: database files found in release tree" >&2
    find "$STAGE" \( -name '*.db' -o -name '*sqlite*' \) >&2
    bad=1
  fi

  if [[ "$bad" -ne 0 ]]; then
    return 1
  fi
  echo "[guartrix] Release tree clean (mode=$MODE)"
}
