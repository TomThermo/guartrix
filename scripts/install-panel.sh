#!/usr/bin/env bash
# Guartrix panel installer — one-shot install on a fresh Ubuntu VPS.
# Installs panel + local daemon + web. Does NOT run a license server
# (customers use LICENSE_SERVER_URL=https://license.guartrix.com).
#
#   curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
#   # same as scripts/install-panel.sh
#
# Or with options:
#   curl -fsSL … | sudo bash -s -- --domain guartrix.com --ip 1.2.3.4
#
# Env overrides (non-interactive):
#   GUARTRIX_DOMAIN, GUARTRIX_PUBLIC_IP, GUARTRIX_ADMIN_PASSWORD,
#   GUARTRIX_REPO_URL, GUARTRIX_INSTALL_DIR, GUARTRIX_LICENSE_KEY

set -euo pipefail

REPO_URL="${GUARTRIX_REPO_URL:-https://github.com/TomThermo/guartrix.git}"
INSTALL_DIR="${GUARTRIX_INSTALL_DIR:-/opt/guartrix}"
DOMAIN="${GUARTRIX_DOMAIN:-}"
PUBLIC_IP="${GUARTRIX_PUBLIC_IP:-}"
ADMIN_PASSWORD="${GUARTRIX_ADMIN_PASSWORD:-}"
BRANCH="${GUARTRIX_BRANCH:-main}"
LICENSE_KEY="${GUARTRIX_LICENSE_KEY:-}"
SKIP_START=0

usage() {
  cat <<'EOF'
Guartrix panel installer (Ubuntu 22.04/24.04)

Installs: panel API + web + local daemon (+ MySQL via Docker).
Does not install the Guartrix license server (uses license.guartrix.com).

Options:
  --domain HOST          Public hostname (e.g. guartrix.com)
  --ip ADDR              Public IPv4
  --admin-password PASS  Initial admin password (min 12 chars, mixed)
  --license-key KEY      Panel LICENSE_KEY (GTRX-…); can set later in Admin → License
  --dir PATH             Install directory (default: /opt/guartrix)
  --repo URL             Git clone URL
  --branch NAME          Git branch (default: main)
  --skip-start           Install only; do not start services
  -h, --help             Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --ip) PUBLIC_IP="${2:-}"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;
    --license-key) LICENSE_KEY="${2:-}"; shift 2 ;;
    --dir) INSTALL_DIR="${2:-}"; shift 2 ;;
    --repo) REPO_URL="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --skip-start) SKIP_START=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "[guartrix] Installing panel prerequisites…"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git openssl ufw

if ! command -v docker >/dev/null 2>&1; then
  echo "[guartrix] Installing Docker…"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)" -lt 22 ]]; then
  echo "[guartrix] Installing Node.js 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(curl -4 -fsSL https://ifconfig.me 2>/dev/null || curl -4 -fsSL https://api.ipify.org 2>/dev/null || true)"
fi
if [[ -z "$DOMAIN" ]]; then
  DOMAIN="${PUBLIC_IP:-127.0.0.1}"
fi
if [[ -z "$ADMIN_PASSWORD" ]]; then
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)Aa1!"
  echo "[guartrix] Generated ADMIN_PASSWORD (save this): ${ADMIN_PASSWORD}"
fi

SESSION_SECRET="$(openssl rand -hex 32)"
MYSQL_PASSWORD="$(openssl rand -hex 24)"
MYSQL_ROOT_PASSWORD="$(openssl rand -hex 24)"

echo "[guartrix] Cloning ${REPO_URL} (${BRANCH}) → ${INSTALL_DIR}"
mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" || true
else
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
mkdir -p data/servers data/backups data/sessions data/logs data/run data/mail-outbox cert
chmod 700 data

cat > .env <<EOF
ADMIN_PASSWORD=${ADMIN_PASSWORD}
HOST=127.0.0.1
API_PORT=3001
WEB_PORT=80
HTTPS_PORT=443
HTTPS_ENABLED=true
WEB_HOST=0.0.0.0
SESSION_SECRET=${SESSION_SECRET}
DATA_DIR=./data
DOCKER_IMAGE=eclipse-temurin:25-jre-jammy
MANAGE_FIREWALL=true
PUBLIC_HOST=${DOMAIN}
PUBLIC_IP=${PUBLIC_IP}
PUBLIC_BASE_URL=https://${DOMAIN}
SESSION_SECURE=true
TRUST_PROXY=true
DAEMON_HOST=127.0.0.1
DAEMON_PORT=8081
SFTP_PORT=2022
SFTP_ENABLED=true
PANEL_URL=http://127.0.0.1:3001
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=guartrix_panel
MYSQL_USER=guartrix
MYSQL_PASSWORD=${MYSQL_PASSWORD}
DATABASE_URL=mysql://guartrix:${MYSQL_PASSWORD}@127.0.0.1:3306/guartrix_panel
REGISTRATION_ENABLED=true
DEFAULT_MAX_SERVERS=0
DEFAULT_MAX_MEMORY_MB=0
DEFAULT_MAX_DATABASES=0
MONITOR_INTERVAL=20
BOOT_START_STAGGER_MS=20000
# Customer installs talk to Guartrix's public license API — no local license-server
SKIP_LOCAL_LICENSE_SERVER=1
LICENSE_SERVER_URL=https://license.guartrix.com
EOF
if [[ -n "$LICENSE_KEY" ]]; then
  printf 'LICENSE_KEY=%s\n' "$LICENSE_KEY" >> .env
fi
chmod 600 .env

# Local daemon env (token filled on first API start / ensureLocalNode)
cat > data/daemon.env <<EOF
DAEMON_HOST=127.0.0.1
DAEMON_PORT=8081
DATA_DIR=${INSTALL_DIR}/data
PUBLIC_HOST=${DOMAIN}
PUBLIC_IP=${PUBLIC_IP}
PANEL_URL=http://127.0.0.1:3001
SFTP_PORT=2022
SFTP_ENABLED=true
DOCKER_IMAGE=eclipse-temurin:25-jre-jammy
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_PORT=3306
MYSQL_IMAGE=mysql:8.4
MANAGE_FIREWALL=true
EOF
chmod 600 data/daemon.env

echo "[guartrix] npm install + build…"
npm install
if [[ -f apps/api/src/index.ts ]]; then
  npm run build
elif [[ -f apps/api/dist/index.js && -f apps/web/dist/index.html ]]; then
  echo "[guartrix] Using prebuilt release bundles (no TypeScript sources)"
else
  echo "[guartrix] ERROR: no sources and no prebuilt dist — cannot continue" >&2
  exit 1
fi
npm run db:generate -w @msm/api

# Start MySQL via docker if not reachable (daemon will also ensure it)
if ! docker ps --format '{{.Names}}' | grep -qx guartrix-mysql; then
  echo "[guartrix] Starting MySQL container…"
  docker network create guartrix 2>/dev/null || true
  docker run -d --name guartrix-mysql --restart unless-stopped \
    --network guartrix \
    -e MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD}" \
    -e MYSQL_DATABASE=guartrix_panel \
    -e MYSQL_USER=guartrix \
    -e MYSQL_PASSWORD="${MYSQL_PASSWORD}" \
    -p 127.0.0.1:3306:3306 \
    -v "${INSTALL_DIR}/data/mysql:/var/lib/mysql" \
    mysql:8.4
  echo "[guartrix] Waiting for MySQL…"
  for i in $(seq 1 60); do
    if docker exec guartrix-mysql mysqladmin ping -h 127.0.0.1 -uroot -p"${MYSQL_ROOT_PASSWORD}" --silent 2>/dev/null; then
      break
    fi
    sleep 2
  done
fi

npm run db:push -w @msm/api

# systemd units
cat > /etc/systemd/system/guartrix-daemon.service <<EOF
[Unit]
Description=Guartrix local daemon
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/data/daemon.env
Environment=NODE_ENV=production
Environment=GUARTRIX_ROOT=${INSTALL_DIR}
ExecStart=$(command -v node) ${INSTALL_DIR}/apps/daemon/dist/index.js
Restart=always
RestartSec=3
KillMode=process

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/guartrix-api.service <<EOF
[Unit]
Description=Guartrix panel API
After=network-online.target guartrix-daemon.service docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--dns-result-order=ipv4first
ExecStart=$(command -v node) ${INSTALL_DIR}/apps/api/dist/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/guartrix-web.service <<EOF
[Unit]
Description=Guartrix panel web (HTTPS proxy)
After=network-online.target guartrix-api.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
Environment=NODE_ENV=production
ExecStart=$(command -v node) ${INSTALL_DIR}/scripts/prod-web.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# Firewall
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw allow 2022/tcp >/dev/null 2>&1 || true
  ufw allow 25565:25600/tcp >/dev/null 2>&1 || true
fi

if [[ "$SKIP_START" -eq 0 ]]; then
  systemctl enable --now guartrix-daemon.service guartrix-api.service guartrix-web.service
  # Prefer start.sh for first boot (writes daemon token via API)
  sleep 2
  bash "${INSTALL_DIR}/scripts/start.sh" || true
fi

echo
echo "=============================================="
echo " Guartrix panel installed"
echo "=============================================="
echo "  Dir:     ${INSTALL_DIR}"
echo "  Domain:  https://${DOMAIN}"
echo "  Admin:   admin"
echo "  Password:${ADMIN_PASSWORD}"
echo
echo " Put a Cloudflare Origin cert in ${INSTALL_DIR}/cert/ as"
echo "   guartrix.com.crt + guartrix.com.key  (or set TLS_* in .env)"
echo
echo " License: LICENSE_SERVER_URL=https://license.guartrix.com"
if [[ -z "$LICENSE_KEY" ]]; then
  echo " Set LICENSE_KEY in .env (or Admin → License) with your GTRX-… key."
fi
echo " Add extra nodes: System → Add node → Install via SSH"
echo "=============================================="
