#!/usr/bin/env bash
# Guartrix panel installer — one-shot install on a fresh Ubuntu VPS.
# Installs panel + local daemon + web. Does NOT run a license server
# (customers use LICENSE_SERVER_URL=https://license.guartrix.com).
#
#   curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
#   # same as scripts/install-panel.sh
#
# Or with options:
#   # HTTP via public IP only (no TLS):
#   curl -fsSL … | sudo bash -s -- --http --ip 1.2.3.4
#   # HTTPS with domain + cert:
#   curl -fsSL … | sudo bash -s -- --https --domain guartrix.com --ip 1.2.3.4
#   # External panel MySQL:
#   curl -fsSL … | sudo bash -s -- --mysql-external --mysql-host 10.0.0.5 \
#     --mysql-user guartrix --mysql-password '…' --mysql-database guartrix_panel
#
# Env overrides (non-interactive):
#   GUARTRIX_DOMAIN, GUARTRIX_PUBLIC_IP, GUARTRIX_ADMIN_PASSWORD,
#   GUARTRIX_REPO_URL, GUARTRIX_INSTALL_DIR, GUARTRIX_LICENSE_KEY,
#   GUARTRIX_HTTPS=0|1 (0 = HTTP via IP/host, 1 = HTTPS),
#   GUARTRIX_MYSQL_MODE=docker|external,
#   GUARTRIX_DATABASE_URL / GUARTRIX_MYSQL_HOST|PORT|DATABASE|USER|PASSWORD

set -euo pipefail

REPO_URL="${GUARTRIX_REPO_URL:-https://github.com/TomThermo/guartrix.git}"
INSTALL_DIR="${GUARTRIX_INSTALL_DIR:-/opt/guartrix}"
DOMAIN="${GUARTRIX_DOMAIN:-}"
PUBLIC_IP="${GUARTRIX_PUBLIC_IP:-}"
ADMIN_PASSWORD="${GUARTRIX_ADMIN_PASSWORD:-}"
BRANCH="${GUARTRIX_BRANCH:-main}"
LICENSE_KEY="${GUARTRIX_LICENSE_KEY:-}"
# empty = decide later (prompt / heuristics); 0|1 after resolve
HTTPS_MODE="${GUARTRIX_HTTPS:-}"
# empty | docker | external
MYSQL_MODE="${GUARTRIX_MYSQL_MODE:-}"
MYSQL_HOST="${GUARTRIX_MYSQL_HOST:-}"
MYSQL_PORT="${GUARTRIX_MYSQL_PORT:-3306}"
MYSQL_DATABASE="${GUARTRIX_MYSQL_DATABASE:-guartrix_panel}"
MYSQL_USER="${GUARTRIX_MYSQL_USER:-guartrix}"
MYSQL_PASSWORD="${GUARTRIX_MYSQL_PASSWORD:-}"
DATABASE_URL_OVERRIDE="${GUARTRIX_DATABASE_URL:-}"
SKIP_START=0

usage() {
  cat <<'EOF'
Guartrix panel installer (Ubuntu 22.04/24.04)

Installs: panel API + web + local daemon.
Does not install the Guartrix license server (uses license.guartrix.com).

Options:
  --domain HOST          Public hostname (e.g. guartrix.com)
  --ip ADDR              Public IPv4
  --https                Enable HTTPS (domain + TLS on :443)
  --http, --no-https     HTTP only (open panel at http://SERVER_IP — no TLS)
  --mysql-docker         Panel DB in Docker container guartrix-mysql (default)
  --mysql-external       Use an existing MySQL/MariaDB for the panel DB
  --mysql-host HOST      External MySQL host (with --mysql-external)
  --mysql-port PORT      External MySQL port (default 3306)
  --mysql-database NAME  Panel database name (default guartrix_panel)
  --mysql-user USER      Panel DB user (default guartrix)
  --mysql-password PASS  Panel DB password
  --database-url URL     Full mysql://… URL (implies --mysql-external)
  --admin-password PASS  Initial admin password (min 12 chars, mixed)
  --license-key KEY      Panel LICENSE_KEY (GTRX-…); can set later in Admin → License
  --dir PATH             Install directory (default: /opt/guartrix)
  --repo URL             Git clone URL
  --branch NAME          Git branch (default: main)
  --skip-start           Install only; do not start services
  -h, --help             Show help

Interactive installs ask about HTTPS and panel MySQL (Docker vs existing).
Game-server MySQL (daemon) still uses Docker; if the panel DB already uses
127.0.0.1:3306, game MySQL is placed on 3307 to avoid a port clash.

Env: GUARTRIX_HTTPS, GUARTRIX_MYSQL_MODE, GUARTRIX_DATABASE_URL, …
EOF
}

is_ipv4() {
  [[ "${1:-}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

normalize_https_flag() {
  local raw="${1:-}"
  case "${raw,,}" in
    1|true|yes|y|on|https) echo 1 ;;
    0|false|no|n|off|http) echo 0 ;;
    *) echo "" ;;
  esac
}

# Read a line from the controlling terminal when possible (works with curl|bash -s).
prompt_tty() {
  local prompt="$1"
  local reply=""
  if [[ -r /dev/tty ]]; then
    printf '%s' "$prompt" > /dev/tty
    IFS= read -r reply < /dev/tty || true
  elif [[ -t 0 ]]; then
    read -r -p "$prompt" reply || true
  fi
  printf '%s' "$reply"
}

normalize_mysql_mode() {
  local raw="${1:-}"
  case "${raw,,}" in
    docker|local|bundled|1) echo docker ;;
    external|existing|remote|0) echo external ;;
    *) echo "" ;;
  esac
}

uri_encode() {
  python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --ip) PUBLIC_IP="${2:-}"; shift 2 ;;
    --https) HTTPS_MODE=1; shift ;;
    --http|--no-https) HTTPS_MODE=0; shift ;;
    --mysql-docker) MYSQL_MODE=docker; shift ;;
    --mysql-external) MYSQL_MODE=external; shift ;;
    --mysql-host) MYSQL_HOST="${2:-}"; MYSQL_MODE="${MYSQL_MODE:-external}"; shift 2 ;;
    --mysql-port) MYSQL_PORT="${2:-}"; shift 2 ;;
    --mysql-database) MYSQL_DATABASE="${2:-}"; shift 2 ;;
    --mysql-user) MYSQL_USER="${2:-}"; shift 2 ;;
    --mysql-password) MYSQL_PASSWORD="${2:-}"; shift 2 ;;
    --database-url) DATABASE_URL_OVERRIDE="${2:-}"; MYSQL_MODE=external; shift 2 ;;
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

# Normalize env override if still unset from flags
if [[ -z "$HTTPS_MODE" && -n "${GUARTRIX_HTTPS:-}" ]]; then
  HTTPS_MODE="$(normalize_https_flag "${GUARTRIX_HTTPS}")"
fi
HTTPS_MODE="$(normalize_https_flag "$HTTPS_MODE")"

if [[ -z "$MYSQL_MODE" && -n "${GUARTRIX_MYSQL_MODE:-}" ]]; then
  MYSQL_MODE="$(normalize_mysql_mode "${GUARTRIX_MYSQL_MODE}")"
fi
if [[ -n "$DATABASE_URL_OVERRIDE" ]]; then
  MYSQL_MODE=external
fi
MYSQL_MODE="$(normalize_mysql_mode "$MYSQL_MODE")"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "[guartrix] Installing panel prerequisites…"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git openssl ufw python3

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

# Decide HTTPS vs HTTP (IP) before writing .env
if [[ -z "$HTTPS_MODE" ]]; then
  if [[ -r /dev/tty || -t 0 ]]; then
    echo
    echo "[guartrix] Access mode"
    echo "  1) HTTP only — open the panel at http://SERVER_IP (no TLS cert needed)"
    echo "  2) HTTPS     — domain + TLS on :443 (Cloudflare Origin / Let's Encrypt cert)"
    ans="$(prompt_tty "Use HTTPS with a domain? [y/N]: ")"
    case "${ans,,}" in
      y|yes) HTTPS_MODE=1 ;;
      *) HTTPS_MODE=0 ;;
    esac
  elif [[ -n "$DOMAIN" ]] && ! is_ipv4 "$DOMAIN"; then
    HTTPS_MODE=1
  else
    HTTPS_MODE=0
  fi
fi

if [[ "$HTTPS_MODE" -eq 1 ]]; then
  if [[ -z "$DOMAIN" ]] || is_ipv4 "$DOMAIN"; then
    if [[ -r /dev/tty || -t 0 ]]; then
      DOMAIN="$(prompt_tty "Public domain for HTTPS (e.g. panel.example.com): ")"
    fi
  fi
  if [[ -z "$DOMAIN" ]]; then
    echo "ERROR: --https requires --domain HOST (not an IP)." >&2
    exit 1
  fi
  if is_ipv4 "$DOMAIN"; then
    echo "ERROR: --https needs a hostname, not an IP ($DOMAIN)." >&2
    exit 1
  fi
  PUBLIC_HOST="$DOMAIN"
  PUBLIC_BASE_URL="https://${DOMAIN}"
  HTTPS_ENABLED=true
  SESSION_SECURE=true
  TRUST_PROXY=true
  echo "[guartrix] Mode: HTTPS → ${PUBLIC_BASE_URL}"
else
  # HTTP / IP mode — panel reachable at http://PUBLIC_IP
  if [[ -z "$DOMAIN" ]] || is_ipv4 "$DOMAIN"; then
    PUBLIC_HOST="${PUBLIC_IP:-127.0.0.1}"
  else
    # Optional: hostname over plain HTTP
    PUBLIC_HOST="$DOMAIN"
  fi
  if [[ -z "$PUBLIC_IP" ]]; then
    PUBLIC_IP="$PUBLIC_HOST"
  fi
  DOMAIN="$PUBLIC_HOST"
  PUBLIC_BASE_URL="http://${PUBLIC_HOST}"
  HTTPS_ENABLED=false
  SESSION_SECURE=false
  TRUST_PROXY=false
  echo "[guartrix] Mode: HTTP only → ${PUBLIC_BASE_URL}"
fi

if [[ -z "$ADMIN_PASSWORD" ]]; then
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)Aa1!"
  echo "[guartrix] Generated ADMIN_PASSWORD (save this): ${ADMIN_PASSWORD}"
fi

SESSION_SECRET="$(openssl rand -hex 32)"
# Daemon game-DB MySQL root (Docker) — separate from panel Prisma DB
MYSQL_ROOT_PASSWORD="$(openssl rand -hex 24)"
DAEMON_MYSQL_PORT=3306

# --- Panel MySQL: Docker vs existing server ---
if [[ -z "$MYSQL_MODE" ]]; then
  if [[ -r /dev/tty || -t 0 ]]; then
    echo
    echo "[guartrix] Panel database (Prisma)"
    echo "  1) Docker MySQL — install starts container guartrix-mysql on 127.0.0.1:3306 (recommended)"
    echo "  2) Existing MySQL/MariaDB — you provide host, database, user, password"
    echo "     (create the empty database + user beforehand; installer runs db:push)"
    ans="$(prompt_tty "Use Docker MySQL for the panel? [Y/n]: ")"
    case "${ans,,}" in
      n|no) MYSQL_MODE=external ;;
      *) MYSQL_MODE=docker ;;
    esac
  else
    MYSQL_MODE=docker
  fi
fi

if [[ "$MYSQL_MODE" == "external" ]]; then
  if [[ -z "$DATABASE_URL_OVERRIDE" ]]; then
    if [[ -z "$MYSQL_HOST" ]] && [[ -r /dev/tty || -t 0 ]]; then
      MYSQL_HOST="$(prompt_tty "MySQL host [127.0.0.1]: ")"
      MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
      port_in="$(prompt_tty "MySQL port [${MYSQL_PORT}]: ")"
      MYSQL_PORT="${port_in:-$MYSQL_PORT}"
      db_in="$(prompt_tty "Database name [${MYSQL_DATABASE}]: ")"
      MYSQL_DATABASE="${db_in:-$MYSQL_DATABASE}"
      user_in="$(prompt_tty "MySQL user [${MYSQL_USER}]: ")"
      MYSQL_USER="${user_in:-$MYSQL_USER}"
      if [[ -z "$MYSQL_PASSWORD" ]]; then
        MYSQL_PASSWORD="$(prompt_tty "MySQL password: ")"
      fi
    fi
    if [[ -z "$MYSQL_HOST" || -z "$MYSQL_PASSWORD" ]]; then
      echo "ERROR: --mysql-external needs --mysql-host and --mysql-password (or --database-url)." >&2
      exit 1
    fi
    MYSQL_PORT="${MYSQL_PORT:-3306}"
    MYSQL_DATABASE="${MYSQL_DATABASE:-guartrix_panel}"
    MYSQL_USER="${MYSQL_USER:-guartrix}"
    enc_user="$(uri_encode "$MYSQL_USER")"
    enc_pass="$(uri_encode "$MYSQL_PASSWORD")"
    DATABASE_URL="mysql://${enc_user}:${enc_pass}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}"
  else
    DATABASE_URL="$DATABASE_URL_OVERRIDE"
    # Best-effort parse for .env MYSQL_* display fields
    if [[ -z "$MYSQL_HOST" ]]; then
      parse="$(
        node -e '
          try {
            const u = new URL(process.argv[1]);
            if (u.protocol !== "mysql:") process.exit(2);
            console.log([
              u.hostname || "127.0.0.1",
              u.port || "3306",
              (u.pathname || "/guartrix_panel").replace(/^\//, "") || "guartrix_panel",
              decodeURIComponent(u.username || "guartrix"),
              decodeURIComponent(u.password || ""),
            ].join("\n"));
          } catch { process.exit(2); }
        ' "$DATABASE_URL" 2>/dev/null || true
      )"
      if [[ -n "$parse" ]]; then
        MYSQL_HOST="$(echo "$parse" | sed -n '1p')"
        MYSQL_PORT="$(echo "$parse" | sed -n '2p')"
        MYSQL_DATABASE="$(echo "$parse" | sed -n '3p')"
        MYSQL_USER="$(echo "$parse" | sed -n '4p')"
        MYSQL_PASSWORD="$(echo "$parse" | sed -n '5p')"
      else
        MYSQL_HOST="${MYSQL_HOST:-external}"
        MYSQL_PORT="${MYSQL_PORT:-3306}"
        MYSQL_DATABASE="${MYSQL_DATABASE:-guartrix_panel}"
        MYSQL_USER="${MYSQL_USER:-guartrix}"
        MYSQL_PASSWORD="${MYSQL_PASSWORD:-(see DATABASE_URL)}"
      fi
    fi
  fi
  # Avoid clashing with daemon game-MySQL Docker on the same loopback port
  if [[ "$MYSQL_HOST" == "127.0.0.1" || "$MYSQL_HOST" == "localhost" ]] && [[ "$MYSQL_PORT" == "3306" ]]; then
    DAEMON_MYSQL_PORT=3307
    echo "[guartrix] Panel MySQL uses ${MYSQL_HOST}:3306 — game MySQL Docker will use port ${DAEMON_MYSQL_PORT}"
  fi
  echo "[guartrix] Panel DB: external MySQL at ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE} (user ${MYSQL_USER})"
else
  MYSQL_MODE=docker
  MYSQL_HOST=127.0.0.1
  MYSQL_PORT=3306
  MYSQL_DATABASE=guartrix_panel
  MYSQL_USER=guartrix
  MYSQL_PASSWORD="$(openssl rand -hex 24)"
  enc_user="$(uri_encode "$MYSQL_USER")"
  enc_pass="$(uri_encode "$MYSQL_PASSWORD")"
  DATABASE_URL="mysql://${enc_user}:${enc_pass}@127.0.0.1:3306/${MYSQL_DATABASE}"
  echo "[guartrix] Panel DB: Docker MySQL (guartrix-mysql on 127.0.0.1:3306)"
fi

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
HTTPS_ENABLED=${HTTPS_ENABLED}
WEB_HOST=0.0.0.0
SESSION_SECRET=${SESSION_SECRET}
DATA_DIR=./data
DOCKER_IMAGE=eclipse-temurin:25-jre-jammy
MANAGE_FIREWALL=true
PUBLIC_HOST=${PUBLIC_HOST}
PUBLIC_IP=${PUBLIC_IP}
PUBLIC_BASE_URL=${PUBLIC_BASE_URL}
SESSION_SECURE=${SESSION_SECURE}
TRUST_PROXY=${TRUST_PROXY}
DAEMON_HOST=127.0.0.1
DAEMON_PORT=8081
SFTP_PORT=2022
SFTP_ENABLED=true
PANEL_URL=http://127.0.0.1:3001
MYSQL_HOST=${MYSQL_HOST}
MYSQL_PORT=${MYSQL_PORT}
MYSQL_DATABASE=${MYSQL_DATABASE}
MYSQL_USER=${MYSQL_USER}
MYSQL_PASSWORD=${MYSQL_PASSWORD}
DATABASE_URL=${DATABASE_URL}
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
PUBLIC_HOST=${PUBLIC_HOST}
PUBLIC_IP=${PUBLIC_IP}
PANEL_URL=http://127.0.0.1:3001
SFTP_PORT=2022
SFTP_ENABLED=true
DOCKER_IMAGE=eclipse-temurin:25-jre-jammy
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_PORT=${DAEMON_MYSQL_PORT}
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

# Panel MySQL: Docker only when requested (daemon still manages game-DB MySQL separately)
if [[ "$MYSQL_MODE" == "docker" ]]; then
  if ! docker ps --format '{{.Names}}' | grep -qx guartrix-mysql; then
    echo "[guartrix] Starting panel MySQL container (guartrix-mysql)…"
    docker network create guartrix 2>/dev/null || true
    docker run -d --name guartrix-mysql --restart unless-stopped \
      --network guartrix \
      -e MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD}" \
      -e MYSQL_DATABASE="${MYSQL_DATABASE}" \
      -e MYSQL_USER="${MYSQL_USER}" \
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
  else
    echo "[guartrix] MySQL container guartrix-mysql already running — reusing"
  fi
else
  echo "[guartrix] Skipping Docker MySQL — using external panel database"
  echo "[guartrix] Ensure database '${MYSQL_DATABASE}' and user '${MYSQL_USER}' already exist with rights."
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

WEB_DESC="Guartrix panel web (HTTP)"
if [[ "$HTTPS_MODE" -eq 1 ]]; then
  WEB_DESC="Guartrix panel web (HTTPS proxy)"
fi
cat > /etc/systemd/system/guartrix-web.service <<EOF
[Unit]
Description=${WEB_DESC}
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
  if [[ "$HTTPS_MODE" -eq 1 ]]; then
    ufw allow 443/tcp >/dev/null 2>&1 || true
  fi
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
echo "  URL:     ${PUBLIC_BASE_URL}"
echo "  Admin:   admin"
echo "  Password:${ADMIN_PASSWORD}"
echo
if [[ "$HTTPS_MODE" -eq 1 ]]; then
  echo " Put a Cloudflare Origin cert in ${INSTALL_DIR}/cert/ as"
  echo "   ${PUBLIC_HOST}.crt + ${PUBLIC_HOST}.key  (or set TLS_* in .env)"
  echo
else
  echo " HTTP-only mode: open ${PUBLIC_BASE_URL} in your browser."
  echo " No TLS cert needed. Cookies are not Secure (SESSION_SECURE=false)."
  echo " For production with a domain later: set HTTPS_ENABLED=true,"
  echo " SESSION_SECURE=true, TRUST_PROXY=true, PUBLIC_BASE_URL=https://…"
  echo " and place certs under cert/, then restart."
  echo
fi
echo " License: LICENSE_SERVER_URL=https://license.guartrix.com"
if [[ -z "$LICENSE_KEY" ]]; then
  echo " Set LICENSE_KEY in .env (or Admin → License) with your GTRX-… key."
fi
if [[ "$MYSQL_MODE" == "docker" ]]; then
  echo " Panel DB: Docker guartrix-mysql @ 127.0.0.1:3306 / ${MYSQL_DATABASE}"
else
  echo " Panel DB: external ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE} (user ${MYSQL_USER})"
  if [[ "$DAEMON_MYSQL_PORT" != "3306" ]]; then
    echo " Game MySQL (daemon Docker): 127.0.0.1:${DAEMON_MYSQL_PORT}"
  fi
fi
echo " Add extra nodes: System → Add node → Install via SSH"
echo "=============================================="
