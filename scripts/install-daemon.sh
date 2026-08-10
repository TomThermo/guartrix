#!/usr/bin/env bash
# Guartrix remote daemon installer (node).
# Run on the game node / VPS that should host Minecraft containers.
#
# Recommended (download, then run) — uses prebuilt bundle from the panel (no tsc):
#   curl -Lo /tmp/guartrix-daemon.sh http://YOUR_PANEL/install-daemon.sh
#   sudo bash /tmp/guartrix-daemon.sh \
#     --token TOKEN --node-id NODE_ID --panel http://panel --fqdn NODE_IP --port 8081
#
# Or from a local checkout:
#   sudo bash scripts/install-daemon.sh --token TOKEN --node-id NODE_ID --fqdn 1.2.3.4 --port 8081

set -euo pipefail

TOKEN=""
NODE_ID=""
PANEL_URL=""
FQDN=""
DAEMON_PORT="8081"
INSTALL_DIR="/opt/guartrix"
DATA_DIR="/var/lib/guartrix"
REPO_URL="${GUARTRIX_REPO_URL:-}"
BRANCH="${GUARTRIX_BRANCH:-main}"
BUNDLE_URL="${GUARTRIX_DAEMON_BUNDLE_URL:-}"
SFTP_PORT="${SFTP_PORT:-2022}"

usage() {
  cat <<'EOF'
Guartrix daemon installer

Required:
  --token TOKEN          Daemon shared secret from the panel (System → Add node)
  --node-id ID           Panel node id (JWT claims)

Optional:
  --panel URL            Panel base URL (also used to fetch the prebuilt daemon zip)
  --fqdn HOST            Public IP or hostname of this node
  --port PORT            Daemon listen port (default: 8081)
  --sftp-port PORT       SFTP listen port (default: 2022)
  --dir PATH             Install directory (default: /opt/guartrix)
  --data PATH            Server data directory (default: /var/lib/guartrix)
  --bundle-url URL       Prebuilt daemon zip (default: $PANEL/install-daemon-bundle.zip)
  --repo URL             Git fallback only (compiles — needs RAM/swap; prefer --bundle-url)
  --branch NAME          Git branch (default: main)
  -h, --help             Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="${2:-}"; shift 2 ;;
    --node-id) NODE_ID="${2:-}"; shift 2 ;;
    --panel) PANEL_URL="${2:-}"; shift 2 ;;
    --fqdn) FQDN="${2:-}"; shift 2 ;;
    --port) DAEMON_PORT="${2:-}"; shift 2 ;;
    --sftp-port) SFTP_PORT="${2:-}"; shift 2 ;;
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --data) DATA_DIR="${2:-}"; shift 2 ;;
    --bundle-url) BUNDLE_URL="${2:-}"; shift 2 ;;
    --repo) REPO_URL="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: --token is required (create a node in the panel first)." >&2
  exit 1
fi
if [[ -z "$NODE_ID" ]]; then
  echo "ERROR: --node-id is required (panel node id for JWT auth)." >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)." >&2
  exit 1
fi

if [[ -z "$BUNDLE_URL" && -n "$PANEL_URL" ]]; then
  BUNDLE_URL="${PANEL_URL%/}/install-daemon-bundle.zip"
fi

export DEBIAN_FRONTEND=noninteractive
echo "[guartrix] Installing remote daemon (node)…"

apt-get update -y >/dev/null
apt-get install -y ca-certificates curl gnupg git openssl tar ufw unzip >/dev/null

# Supply-chain note: curl|sh installs below are skipped when docker/node already exist.
# Preferred production path: preseed Docker Engine + Node.js 22 from pinned packages
# (see docs/wiki/install-nodes.md#install-script-supply-chain-residual-risk).
if ! command -v docker >/dev/null 2>&1; then
  echo "[guartrix] Installing Docker via get.docker.com (unpinned convenience script)…"
  echo "[guartrix] Tip: pre-install docker from pinned CE packages to skip this step."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" -lt 22 ]]; then
  echo "[guartrix] Installing Node.js 22 via NodeSource setup (unpinned convenience script)…"
  echo "[guartrix] Tip: pre-install nodejs 22.x from a pinned repo to skip this step."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

ensure_standalone_daemon_package_json() {
  local pkg="$1"
  [[ -f "$pkg" ]] || return 0
  node -e '
const fs = require("fs");
const p = process.argv[1];
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
pkg.dependencies = pkg.dependencies || {};
delete pkg.dependencies["@guartrix/shared"];
delete pkg.dependencies["@guartrix/node-agent"];
delete pkg.devDependencies;
pkg.dependencies.ssh2 = pkg.dependencies.ssh2 || "^1.16.0";
pkg.scripts = { start: "node dist/index.js" };
fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
' "$pkg"
}

# Prefer an existing monorepo / prebuilt tree, else panel bundle, else git (last resort).
ROOT=""
if [[ -f "$(pwd)/apps/daemon/dist/index.js" ]]; then
  ROOT="$(pwd)"
elif [[ -f "$(pwd)/apps/daemon/src/index.ts" && -f "$(pwd)/package.json" ]]; then
  # Developer / operator checkout — may compile (has swap tips below).
  ROOT="$(pwd)"
elif [[ -f "/home/ubuntu/Documents/Minecraft/apps/daemon/package.json" ]]; then
  ROOT="/home/ubuntu/Documents/Minecraft"
elif [[ -f "${INSTALL_DIR}/apps/daemon/dist/index.js" ]]; then
  ROOT="$INSTALL_DIR"
elif [[ -n "$BUNDLE_URL" ]]; then
  echo "[guartrix] Downloading prebuilt daemon bundle…"
  echo "[guartrix]   ${BUNDLE_URL}"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  TMP_ZIP="$(mktemp /tmp/guartrix-daemon-XXXXXX.zip)"
  if ! curl -fL --connect-timeout 15 --max-time 300 -o "$TMP_ZIP" "$BUNDLE_URL"; then
    rm -f "$TMP_ZIP"
    echo "ERROR: failed to download daemon bundle from ${BUNDLE_URL}" >&2
    echo "Ensure the panel is reachable and has packaged/built the daemon." >&2
    exit 1
  fi
  if ! unzip -q "$TMP_ZIP" -d "$INSTALL_DIR"; then
    rm -f "$TMP_ZIP"
    echo "ERROR: could not unzip daemon bundle" >&2
    exit 1
  fi
  rm -f "$TMP_ZIP"
  ROOT="$INSTALL_DIR"
elif [[ -n "$REPO_URL" ]]; then
  echo "[guartrix] WARN: cloning git and compiling — needs ≥2 GiB free RAM or swap (prefer --panel / bundle)."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  ROOT="$INSTALL_DIR"
else
  echo "ERROR: no daemon tree found. Pass --panel URL (recommended) or --bundle-url / --repo." >&2
  exit 1
fi

mkdir -p "$DATA_DIR/servers" "$DATA_DIR/run" "$DATA_DIR/backups" "$DATA_DIR/licenses"
chmod 700 "$DATA_DIR"

if [[ -f "${ROOT}/scripts/lib-license-public-key.sh" ]]; then
  # shellcheck source=./lib-license-public-key.sh
  source "${ROOT}/scripts/lib-license-public-key.sh"
  guartrix_ensure_license_signing_public_pem "$ROOT" "$DATA_DIR"
fi

ENV_FILE="$DATA_DIR/daemon.env"
MYSQL_PASS="$(openssl rand -hex 24)"
cat > "$ENV_FILE" <<EOF
# Generated by scripts/install-daemon.sh — do not commit
DAEMON_TOKEN=${TOKEN}
DAEMON_NODE_ID=${NODE_ID}
DAEMON_PORT=${DAEMON_PORT}
DAEMON_HOST=0.0.0.0
DATA_DIR=${DATA_DIR}
PUBLIC_HOST=${FQDN:-0.0.0.0}
PANEL_URL=${PANEL_URL:-}
SFTP_PORT=${SFTP_PORT}
SFTP_ENABLED=true
DAEMON_JWT_TTL=900
DAEMON_JWT_WS_TTL=3600
DAEMON_JWT_LEGACY=false
DOCKER_IMAGE=eclipse-temurin:25-jre-jammy
DOCKER_NETWORK_MODE=per_server
MYSQL_ROOT_PASSWORD=${MYSQL_PASS}
MYSQL_PORT=3306
MYSQL_IMAGE=mysql:8.4
MANAGE_FIREWALL=true
GUARTRIX_ROOT=${ROOT}
EOF
chmod 600 "$ENV_FILE"

echo "[guartrix] Preparing daemon at ${ROOT}…"
cd "$ROOT"

if [[ -f apps/daemon/dist/index.js ]]; then
  echo "[guartrix] Using prebuilt apps/daemon/dist (no TypeScript compile)"
  ensure_standalone_daemon_package_json apps/daemon/package.json
  (cd apps/daemon && npm install --omit=dev)
elif [[ -f apps/daemon/src/index.ts ]]; then
  echo "[guartrix] Compiling from source (may OOM on ≤2 GiB hosts — use panel bundle instead)…"
  if [[ ! -f /swapfile ]] && [[ "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)" -lt 3500 ]]; then
    echo "[guartrix] Low RAM detected — creating temporary 2 GiB swap…"
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none || true
    chmod 600 /swapfile 2>/dev/null || true
    mkswap /swapfile 2>/dev/null || true
    swapon /swapfile 2>/dev/null || true
  fi
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=2048"
  npm install
  npm run build -w @guartrix/shared
  npm run build -w @guartrix/node-agent
  if ! npm run build -w @guartrix/daemon; then
    echo "ERROR: daemon TypeScript build failed (often OOM / exit 137)." >&2
    echo "Re-run with --panel <panel-url> so the installer downloads a prebuilt bundle." >&2
    exit 1
  fi
else
  echo "[guartrix] ERROR: neither apps/daemon/dist/index.js nor sources found" >&2
  exit 1
fi

UNIT=/etc/systemd/system/guartrix-daemon.service
cat > "$UNIT" <<EOF
[Unit]
Description=Guartrix node daemon (multi-node)
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${ROOT}/apps/daemon
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
Environment=GUARTRIX_ROOT=${ROOT}
ExecStart=$(command -v node) ${ROOT}/apps/daemon/dist/index.js
Restart=always
RestartSec=3
KillMode=process
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now guartrix-daemon.service

if command -v ufw >/dev/null 2>&1; then
  PANEL_HOST=""
  PANEL_IP=""
  if [[ -n "${PANEL_URL:-}" ]]; then
    PANEL_HOST="$(printf '%s' "$PANEL_URL" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' | cut -d/ -f1 | cut -d: -f1)"
    if [[ -n "$PANEL_HOST" ]]; then
      PANEL_IP="$(getent ahostsv4 "$PANEL_HOST" 2>/dev/null | awk '{print $1; exit}')"
    fi
  fi
  if [[ -n "$PANEL_IP" ]]; then
    ufw allow from "$PANEL_IP" to any port "${DAEMON_PORT}" proto tcp comment 'Guartrix panel' >/dev/null 2>&1 || true
    echo "[guartrix] Firewall: daemon ${DAEMON_PORT}/tcp allowed from panel ${PANEL_IP}"
  else
    ufw allow "${DAEMON_PORT}/tcp" >/dev/null 2>&1 || true
    echo "[guartrix] WARN: could not resolve panel host — daemon ${DAEMON_PORT}/tcp open to the world"
  fi
  ufw allow "${SFTP_PORT}/tcp" >/dev/null 2>&1 || true
  ufw allow 25565:25600/tcp >/dev/null 2>&1 || true
  ufw allow 19132:19332/udp >/dev/null 2>&1 || true
  ufw allow 25565:25600/udp >/dev/null 2>&1 || true
fi

sleep 1
if systemctl is-active --quiet guartrix-daemon.service; then
  echo "[guartrix] Daemon is running on 0.0.0.0:${DAEMON_PORT} (DOCKER_NETWORK_MODE=per_server)"
else
  echo "[guartrix] WARN: service not active — check: journalctl -u guartrix-daemon -e" >&2
fi

echo
echo "Next steps in the panel (System):"
echo "  1. Node host/FQDN must reach this machine on port ${DAEMON_PORT}"
echo "  2. Prefer firewall: only the panel IP should reach ${DAEMON_PORT}/tcp"
echo "  3. Click “Test connection”"
if [[ -n "$PANEL_URL" ]]; then
  echo "  4. Panel: ${PANEL_URL}"
fi
echo "  5. Firewall: SFTP ${SFTP_PORT}/tcp + game ports (daemon preferably panel-only)"
echo
echo "Token is stored in ${ENV_FILE}"
