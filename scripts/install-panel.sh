#!/usr/bin/env bash
# Guartrix panel installer — one-shot install on a fresh Ubuntu VPS.
# Installs panel + local daemon + web. License validation uses LICENSE_SERVER_URL.
# (customers use LICENSE_SERVER_URL=https://license.guartrix.com).
#
# Recommended: download, then run:
#   curl -Lo /tmp/guartrix-install.sh https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install-panel.sh
#   sudo bash /tmp/guartrix-install.sh
#
# Optional flags (automation / skip wizard):
#   # HTTP via public IP only (no TLS):
#   sudo bash /tmp/guartrix-install.sh --http --ip 1.2.3.4
#   # HTTPS with domain + cert:
#   sudo bash /tmp/guartrix-install.sh --https --domain guartrix.com --ip 1.2.3.4
#   # External panel MySQL:
#   sudo bash /tmp/guartrix-install.sh --mysql-external --mysql-host 10.0.0.5 \
#     --mysql-user guartrix --mysql-password '…' --mysql-database guartrix_panel
#   # Optional Redis for multi-API HA:
#   sudo bash /tmp/guartrix-install.sh --redis-docker
#   sudo bash /tmp/guartrix-install.sh --redis-external --redis-url redis://10.0.0.5:6379/0
#
# Env overrides (non-interactive — set GUARTRIX_NONINTERACTIVE=1 to skip wizard):
#   GUARTRIX_DOMAIN, GUARTRIX_PUBLIC_IP, GUARTRIX_ADMIN_PASSWORD,
#   GUARTRIX_REPO_URL, GUARTRIX_INSTALL_DIR, GUARTRIX_LICENSE_KEY,
#   GUARTRIX_HTTPS=0|1 (0 = HTTP via IP/host, 1 = HTTPS),
#   GUARTRIX_MYSQL_MODE=docker|external,
#   GUARTRIX_DATABASE_URL / GUARTRIX_MYSQL_HOST|PORT|DATABASE|USER|PASSWORD,
#   GUARTRIX_REDIS_MODE=skip|docker|external, GUARTRIX_REDIS_URL,
#   GUARTRIX_INSTALL_ROLE=full|panel|daemon

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
# empty | skip | docker | external
REDIS_MODE="${GUARTRIX_REDIS_MODE:-}"
REDIS_URL_IN="${GUARTRIX_REDIS_URL:-}"
# full | panel | daemon (empty until resolved)
INSTALL_ROLE="${GUARTRIX_INSTALL_ROLE:-}"
# daemon-only extras (passed through / prompted)
DAEMON_TOKEN_IN="${GUARTRIX_DAEMON_TOKEN:-}"
DAEMON_NODE_ID_IN="${GUARTRIX_DAEMON_NODE_ID:-}"
DAEMON_PANEL_URL_IN="${GUARTRIX_PANEL_URL:-}"
DAEMON_PORT_IN="${GUARTRIX_DAEMON_PORT:-8081}"
SKIP_START=0

usage() {
  cat <<'EOF'
Guartrix installer (Ubuntu 24.04 recommended; 22.04 OK)


Roles:
  full    Panel API + web + local daemon (default)
  panel   Panel API + web only (no local daemon — use remote nodes)
  daemon  Game node only (remote daemon for an existing panel)

Does not install the Guartrix license server (uses license.guartrix.com).

Options:
  --role full|panel|daemon
  --full                 Same as --role full
  --panel-only           Same as --role panel (API + web, no local daemon)
  --daemon-only          Same as --role daemon
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
  --redis-docker         Optional Redis in Docker (guartrix-redis) for multi-API HA
  --redis-external       Use an existing Redis (with --redis-url)
  --redis-url URL        redis://… URL (implies --redis-external)
  --redis-skip           Do not configure Redis (default for single-API)
  --admin-password PASS  Initial admin password (min 12 chars, mixed)
  --license-key KEY      Panel LICENSE_KEY (GTRX-…); can set later in Admin → License
  --token TOKEN          Daemon shared secret (daemon role)
  --node-id ID           Panel node id (daemon role)
  --panel URL            Panel base URL for daemon SFTP callbacks (daemon role)
  --daemon-port PORT     Daemon listen port (daemon role, default 8081)
  --dir PATH             Install directory (default: /opt/guartrix)
  --repo URL             Git clone URL
  --branch NAME          Git branch (default: main)
  --skip-start           Install only; do not start services
  -h, --help             Show help

Interactive (no flags, with a TTY — e.g. curl|bash):
  Asks role (full / panel-only / daemon-only), then the matching questions.

Env: GUARTRIX_INSTALL_ROLE, GUARTRIX_HTTPS, GUARTRIX_MYSQL_MODE, GUARTRIX_REDIS_MODE, …
EOF
}

normalize_redis_mode() {
  local raw="${1:-}"
  case "${raw,,}" in
    docker|local|bundled) echo docker ;;
    external|existing|remote) echo external ;;
    skip|none|off|0|"") echo skip ;;
    *) echo "" ;;
  esac
}

normalize_role() {
  local raw="${1:-}"
  case "${raw,,}" in
    full|all|complete) echo full ;;
    panel|panel-only|web|api|no-daemon) echo panel ;;
    daemon|daemon-only|node|worker) echo daemon ;;
    *) echo "" ;;
  esac
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

# Interactive prompts. Prefer the real stdin/stdout TTY (when started via
# `script` or `bash /tmp/gp.sh`). Fall back to /dev/tty for odd redirects.
INSTALLER_VERSION="1.0.92"

can_prompt() {
  [[ -t 0 && -t 1 ]] || [[ -r /dev/tty && -w /dev/tty ]]
}

say() {
  if [[ -t 1 ]]; then
    printf '%s\n' "$*"
  else
    { printf '%s\n' "$*" >/dev/tty; } 2>/dev/null || printf '%s\n' "$*"
  fi
}

# ask VAR "prompt"  — never use $(ask …); that would hide the prompt.
ask() {
  local __var="$1"
  local __prompt="$2"
  local __reply=""
  if [[ -t 0 && -t 1 ]]; then
    printf '%s' "$__prompt"
    IFS= read -r __reply || true
  else
    { printf '%s' "$__prompt" >/dev/tty; } 2>/dev/null || printf '%s' "$__prompt"
    if ! { IFS= read -r __reply </dev/tty; } 2>/dev/null; then
      IFS= read -r __reply || true
    fi
  fi
  __reply="${__reply%$'\r'}"
  printf -v "$__var" '%s' "$__reply"
}

ask_secret() {
  local __var="$1"
  local __prompt="$2"
  local __reply=""
  if [[ -t 0 && -t 1 ]]; then
    printf '%s' "$__prompt"
    IFS= read -rs __reply || true
    printf '\n'
  else
    { printf '%s' "$__prompt" >/dev/tty; } 2>/dev/null || printf '%s' "$__prompt"
    if ! { IFS= read -rs __reply </dev/tty; } 2>/dev/null; then
      IFS= read -rs __reply || true
    fi
    { printf '\n' >/dev/tty; } 2>/dev/null || printf '\n'
  fi
  __reply="${__reply%$'\r'}"
  printf -v "$__var" '%s' "$__reply"
}

normalize_mysql_mode() {
  local raw="${1:-}"
  case "${raw,,}" in
    docker|local|bundled|1) echo docker ;;
    external|existing|remote|0) echo external ;;
    *) echo "" ;;
  esac
}

normalize_redis_mode_strict() {
  local raw="${1:-}"
  case "${raw,,}" in
    docker|local|bundled) echo docker ;;
    external|existing|remote) echo external ;;
    skip|none|off|0) echo skip ;;
    *) echo "" ;;
  esac
}

uri_encode() {
  python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

# True when invoked with no CLI flags → full interactive wizard (curl|bash default)
WIZARD=0
if [[ $# -eq 0 ]] && can_prompt && [[ -z "${GUARTRIX_NONINTERACTIVE:-}" ]]; then
  WIZARD=1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --role) INSTALL_ROLE="$(normalize_role "${2:-}")"; shift 2 ;;
    --full) INSTALL_ROLE=full; shift ;;
    --panel-only|--no-daemon) INSTALL_ROLE=panel; shift ;;
    --daemon-only) INSTALL_ROLE=daemon; shift ;;
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
    --redis-docker) REDIS_MODE=docker; shift ;;
    --redis-external) REDIS_MODE=external; shift ;;
    --redis-skip|--no-redis) REDIS_MODE=skip; shift ;;
    --redis-url) REDIS_URL_IN="${2:-}"; REDIS_MODE="${REDIS_MODE:-external}"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;
    --license-key) LICENSE_KEY="${2:-}"; shift 2 ;;
    --token) DAEMON_TOKEN_IN="${2:-}"; shift 2 ;;
    --node-id) DAEMON_NODE_ID_IN="${2:-}"; shift 2 ;;
    --panel) DAEMON_PANEL_URL_IN="${2:-}"; shift 2 ;;
    --daemon-port) DAEMON_PORT_IN="${2:-}"; shift 2 ;;
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

if [[ -z "$REDIS_MODE" && -n "${GUARTRIX_REDIS_MODE:-}" ]]; then
  REDIS_MODE="$(normalize_redis_mode_strict "${GUARTRIX_REDIS_MODE}")"
fi
if [[ -n "$REDIS_URL_IN" && -z "$REDIS_MODE" ]]; then
  REDIS_MODE=external
fi
# Default: skip Redis (single-API installs)
if [[ -z "$REDIS_MODE" ]]; then
  REDIS_MODE=skip
fi
REDIS_MODE="$(normalize_redis_mode_strict "$REDIS_MODE")"
if [[ -z "$REDIS_MODE" ]]; then
  REDIS_MODE=skip
fi

if [[ -z "$INSTALL_ROLE" && -n "${GUARTRIX_INSTALL_ROLE:-}" ]]; then
  INSTALL_ROLE="$(normalize_role "${GUARTRIX_INSTALL_ROLE}")"
fi
INSTALL_ROLE="$(normalize_role "$INSTALL_ROLE")"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: run as root (sudo)." >&2
  exit 1
fi

# Detect public IP early (wizard can confirm)
DETECTED_IP="$(curl -4 -fsSL https://ifconfig.me 2>/dev/null || curl -4 -fsSL https://api.ipify.org 2>/dev/null || true)"
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$DETECTED_IP"
fi

# ---------------------------------------------------------------------------
# Interactive wizard (no CLI flags): ask everything before long installs
# ---------------------------------------------------------------------------
if [[ "$WIZARD" -eq 1 ]]; then
  say ""
  say "=============================================="
  say " Guartrix installer v${INSTALLER_VERSION}"
  say "=============================================="
  say " Answer the questions below. Press Enter for the default in [brackets]."
  say ""
  say "What do you want to install?"
  say "  1) Full panel — API + web + local daemon (recommended for one VPS)"
  say "  2) Panel only — API + web, no local daemon (use remote game nodes)"
  say "  3) Daemon only — game node for an existing panel"
  ask role_in "Choice [1/2/3] (default 1): "
  case "${role_in}" in
    2) INSTALL_ROLE=panel ;;
    3) INSTALL_ROLE=daemon ;;
    *) INSTALL_ROLE=full ;;
  esac
  say ""
  say "-> Selected: ${INSTALL_ROLE}"
  say ""

  ask dir_in "Install directory [${INSTALL_DIR}]: "
  INSTALL_DIR="${dir_in:-$INSTALL_DIR}"

  ip_default="${PUBLIC_IP:-$DETECTED_IP}"
  ask ip_in "Public IPv4 [${ip_default:-?}]: "
  PUBLIC_IP="${ip_in:-$ip_default}"
  if [[ -z "$PUBLIC_IP" ]]; then
    echo "ERROR: public IP is required." >&2
    exit 1
  fi

  if [[ "$INSTALL_ROLE" == "daemon" ]]; then
    say ""
    say "Daemon node — values from the panel (System → Add node)."
    while [[ -z "$DAEMON_TOKEN_IN" ]]; do
      ask_secret DAEMON_TOKEN_IN "Daemon token: "
      [[ -n "$DAEMON_TOKEN_IN" ]] || say "Token is required."
    done
    while [[ -z "$DAEMON_NODE_ID_IN" ]]; do
      ask DAEMON_NODE_ID_IN "Node id: "
      [[ -n "$DAEMON_NODE_ID_IN" ]] || say "Node id is required."
    done
    panel_def="${DAEMON_PANEL_URL_IN:-}"
    ask DAEMON_PANEL_URL_IN "Panel URL (e.g. https://panel.example.com) [${panel_def}]: "
    DAEMON_PANEL_URL_IN="${DAEMON_PANEL_URL_IN:-$panel_def}"
    ask port_in "Daemon port [${DAEMON_PORT_IN}]: "
    DAEMON_PORT_IN="${port_in:-$DAEMON_PORT_IN}"
    say ""
    say "----------------------------------------------"
    say " Summary (daemon only)"
    say "  Dir:     ${INSTALL_DIR}"
    say "  IP/FQDN: ${PUBLIC_IP}"
    say "  Port:    ${DAEMON_PORT_IN}"
    say "  Panel:   ${DAEMON_PANEL_URL_IN:-(none)}"
    say "  Node:    ${DAEMON_NODE_ID_IN}"
    say "----------------------------------------------"
    ask conf "Continue with install? [Y/n]: "
    case "${conf,,}" in
      n|no) say "Aborted."; exit 0 ;;
    esac
    say ""
  else
    say ""
    say "Access mode"
    say "  n = HTTP only — open http://${PUBLIC_IP} (no TLS cert)"
    say "  y = HTTPS — domain + TLS on :443"
    ask ans "Use HTTPS with a domain? [y/N]: "
    case "${ans,,}" in
      y|yes) HTTPS_MODE=1 ;;
      *) HTTPS_MODE=0 ;;
    esac

    if [[ "$HTTPS_MODE" -eq 1 ]]; then
      while true; do
        ask DOMAIN "Public domain (e.g. panel.example.com): "
        if [[ -n "$DOMAIN" ]] && ! is_ipv4 "$DOMAIN"; then
          break
        fi
        say "Please enter a hostname (not an IP)."
      done
    else
      ask host_in "Panel hostname for HTTP (blank = use IP ${PUBLIC_IP}): "
      DOMAIN="${host_in:-$PUBLIC_IP}"
    fi

    say ""
    ask_secret pw_in "Admin password (blank = generate a strong one): "
    if [[ -n "$pw_in" ]]; then
      ADMIN_PASSWORD="$pw_in"
    fi

    say ""
    ask lic_in "License key GTRX-… (blank = set later in Admin → License): "
    LICENSE_KEY="${lic_in:-}"

    say ""
    say "Panel database (Prisma)"
    say "  Y = Docker MySQL on this server (recommended)"
    say "  n = Existing MySQL/MariaDB (create DB + user first)"
    ask ans "Use Docker MySQL for the panel? [Y/n]: "
    case "${ans,,}" in
      n|no) MYSQL_MODE=external ;;
      *) MYSQL_MODE=docker ;;
    esac

    if [[ "$MYSQL_MODE" == "external" ]]; then
      ask MYSQL_HOST "MySQL host [127.0.0.1]: "
      MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
      ask port_in "MySQL port [3306]: "
      MYSQL_PORT="${port_in:-3306}"
      ask db_in "Database name [guartrix_panel]: "
      MYSQL_DATABASE="${db_in:-guartrix_panel}"
      ask user_in "MySQL user [guartrix]: "
      MYSQL_USER="${user_in:-guartrix}"
      while [[ -z "$MYSQL_PASSWORD" ]]; do
        ask_secret MYSQL_PASSWORD "MySQL password: "
        if [[ -z "$MYSQL_PASSWORD" ]]; then
          say "Password is required for external MySQL."
        fi
      done
    fi

    say ""
    say "Redis (optional — multi-API HA / shared sessions)"
    say "  1) Skip — single panel API (recommended for most installs)"
    say "  2) Docker Redis on this server (guartrix-redis on 127.0.0.1:6379)"
    say "  3) Existing / remote Redis URL"
    ask redis_ans "Redis choice [1/2/3] (default 1): "
    case "${redis_ans}" in
      2) REDIS_MODE=docker ;;
      3) REDIS_MODE=external ;;
      *) REDIS_MODE=skip ;;
    esac
    if [[ "$REDIS_MODE" == "external" ]]; then
      while [[ -z "$REDIS_URL_IN" ]]; do
        ask REDIS_URL_IN "Redis URL [redis://127.0.0.1:6379/0]: "
        REDIS_URL_IN="${REDIS_URL_IN:-redis://127.0.0.1:6379/0}"
      done
    fi

    say ""
    say "----------------------------------------------"
    say " Summary"
    say "  Role:     ${INSTALL_ROLE}"
    say "  Dir:      ${INSTALL_DIR}"
    say "  IP:       ${PUBLIC_IP}"
    if [[ "$HTTPS_MODE" -eq 1 ]]; then
      say "  URL:      https://${DOMAIN}"
    else
      say "  URL:      http://${DOMAIN}"
    fi
    say "  Admin:    admin / (password set or generated)"
    say "  License:  ${LICENSE_KEY:-"(set later)"}"
    say "  Panel DB: ${MYSQL_MODE}"
    if [[ "$MYSQL_MODE" == "external" ]]; then
      say "            ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}"
    fi
    say "  Redis:    ${REDIS_MODE}"
    if [[ "$REDIS_MODE" == "external" ]]; then
      say "            ${REDIS_URL_IN}"
    fi
    if [[ "$INSTALL_ROLE" == "panel" ]]; then
      say "  Daemon:   none locally — add remote nodes after login"
    else
      say "  Daemon:   local on this host"
    fi
    say "----------------------------------------------"
    ask conf "Continue with install? [Y/n]: "
    case "${conf,,}" in
      n|no)
        say "Aborted."
        exit 0
        ;;
    esac
    say ""
  fi
fi

# Default role when non-interactive / no choice
INSTALL_ROLE="$(normalize_role "${INSTALL_ROLE:-full}")"
[[ -n "$INSTALL_ROLE" ]] || INSTALL_ROLE=full

# --- Daemon-only: hand off to install-daemon.sh ---
run_daemon_only_install() {
  local script="" raw_base tmp
  raw_base="${GUARTRIX_INSTALL_RAW_BASE:-https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts}"
  if [[ -f "$(dirname "${BASH_SOURCE[0]}")/install-daemon.sh" ]]; then
    script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install-daemon.sh"
  elif [[ -f "$INSTALL_DIR/scripts/install-daemon.sh" ]]; then
    script="$INSTALL_DIR/scripts/install-daemon.sh"
  else
    tmp="$(mktemp)"
    echo "[guartrix] Fetching install-daemon.sh …"
    curl -fsSL "${raw_base}/install-daemon.sh" -o "$tmp"
    script="$tmp"
  fi
  local args=(
    --token "$DAEMON_TOKEN_IN"
    --node-id "$DAEMON_NODE_ID_IN"
    --fqdn "$PUBLIC_IP"
    --port "$DAEMON_PORT_IN"
    --dir "$INSTALL_DIR"
    --repo "$REPO_URL"
    --branch "$BRANCH"
  )
  [[ -n "$DAEMON_PANEL_URL_IN" ]] && args+=(--panel "$DAEMON_PANEL_URL_IN")
  echo "[guartrix] Installing daemon only…"
  bash "$script" "${args[@]}"
  [[ "$script" == /tmp/* || "$script" == /var/tmp/* ]] && rm -f "$script" || true
}

if [[ "$INSTALL_ROLE" == "daemon" ]]; then
  if [[ -z "$DAEMON_TOKEN_IN" || -z "$DAEMON_NODE_ID_IN" ]]; then
    if can_prompt; then
      [[ -z "$PUBLIC_IP" ]] && PUBLIC_IP="$DETECTED_IP"
      while [[ -z "$DAEMON_TOKEN_IN" ]]; do
        ask_secret DAEMON_TOKEN_IN "Daemon token: "
      done
      while [[ -z "$DAEMON_NODE_ID_IN" ]]; do
        ask DAEMON_NODE_ID_IN "Node id: "
      done
      [[ -z "$DAEMON_PANEL_URL_IN" ]] && ask DAEMON_PANEL_URL_IN "Panel URL: "
      [[ -z "$PUBLIC_IP" ]] && ask PUBLIC_IP "Node public IP/FQDN: "
    else
      echo "ERROR: daemon role needs --token and --node-id (or interactive TTY)." >&2
      exit 1
    fi
  fi
  [[ -n "$PUBLIC_IP" ]] || PUBLIC_IP="${DETECTED_IP:-}"
  run_daemon_only_install
  exit 0
fi

SKIP_LOCAL_DAEMON=0
if [[ "$INSTALL_ROLE" == "panel" ]]; then
  SKIP_LOCAL_DAEMON=1
fi

export DEBIAN_FRONTEND=noninteractive

echo "[guartrix] Installing panel prerequisites…"
apt-get update -y
apt-get install -y ca-certificates curl gnupg git openssl ufw python3 zip unzip

# Prefer preseeded Docker/Node (pinned packages) — see docs/wiki/install-nodes.md supply-chain section.
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

if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP="$(curl -4 -fsSL https://ifconfig.me 2>/dev/null || curl -4 -fsSL https://api.ipify.org 2>/dev/null || true)"
fi

# Decide HTTPS vs HTTP when not already set by wizard/flags
if [[ -z "$HTTPS_MODE" ]]; then
  if can_prompt; then
    echo
    echo "[guartrix] Access mode"
    echo "  1) HTTP only — open the panel at http://SERVER_IP (no TLS cert needed)"
    echo "  2) HTTPS     — domain + TLS on :443 (Cloudflare Origin / Let's Encrypt cert)"
    ask ans "Use HTTPS with a domain? [y/N]: "
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
    if can_prompt; then
      ask DOMAIN "Public domain for HTTPS (e.g. panel.example.com): "
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
  # HTTP / IP mode — panel reachable at http://PUBLIC_IP (or optional hostname)
  if [[ -z "$DOMAIN" ]] || is_ipv4 "$DOMAIN"; then
    PUBLIC_HOST="${PUBLIC_IP:-127.0.0.1}"
  else
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
  if can_prompt && [[ "$WIZARD" -eq 0 ]]; then
    ask_secret pw_in "Admin password (blank = generate): "
    ADMIN_PASSWORD="${pw_in:-}"
  fi
fi
if [[ -z "$ADMIN_PASSWORD" ]]; then
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)Aa1!"
  echo "[guartrix] Generated ADMIN_PASSWORD (save this): ${ADMIN_PASSWORD}"
fi

if [[ -z "$LICENSE_KEY" ]] && can_prompt && [[ "$WIZARD" -eq 0 ]]; then
  ask lic_in "License key GTRX-… (blank = set later): "
  LICENSE_KEY="${lic_in:-}"
fi

SESSION_SECRET="$(openssl rand -hex 32)"
# Daemon game-DB MySQL root (Docker) — separate from panel Prisma DB
MYSQL_ROOT_PASSWORD="$(openssl rand -hex 24)"
DAEMON_MYSQL_PORT=3306

# --- Panel MySQL: Docker vs existing server ---
if [[ -z "$MYSQL_MODE" ]]; then
  if can_prompt; then
    echo
    echo "[guartrix] Panel database (Prisma)"
    echo "  1) Docker MySQL — install starts container guartrix-mysql on 127.0.0.1:3306 (recommended)"
    echo "  2) Existing MySQL/MariaDB — you provide host, database, user, password"
    echo "     (create the empty database + user beforehand; installer runs migrate deploy)"
    ask ans "Use Docker MySQL for the panel? [Y/n]: "
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
    if [[ -z "$MYSQL_HOST" ]] && can_prompt; then
      ask MYSQL_HOST "MySQL host [127.0.0.1]: "
      MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
      ask port_in "MySQL port [${MYSQL_PORT}]: "
      MYSQL_PORT="${port_in:-$MYSQL_PORT}"
      ask db_in "Database name [${MYSQL_DATABASE}]: "
      MYSQL_DATABASE="${db_in:-$MYSQL_DATABASE}"
      ask user_in "MySQL user [${MYSQL_USER}]: "
      MYSQL_USER="${user_in:-$MYSQL_USER}"
      if [[ -z "$MYSQL_PASSWORD" ]]; then
        ask_secret MYSQL_PASSWORD "MySQL password: "
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
  MYSQL_PASSWORD=""
  # Official MySQL image only applies MYSQL_* on first volume init. Re-runs must
  # reuse the password the container/volume was created with — not a new random one.
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx guartrix-mysql; then
    _denv="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' guartrix-mysql 2>/dev/null || true)"
    MYSQL_PASSWORD="$(printf '%s\n' "$_denv" | sed -n 's/^MYSQL_PASSWORD=//p' | head -1)"
    _db="$(printf '%s\n' "$_denv" | sed -n 's/^MYSQL_DATABASE=//p' | head -1)"
    _user="$(printf '%s\n' "$_denv" | sed -n 's/^MYSQL_USER=//p' | head -1)"
    _root="$(printf '%s\n' "$_denv" | sed -n 's/^MYSQL_ROOT_PASSWORD=//p' | head -1)"
    [[ -n "$_db" ]] && MYSQL_DATABASE="$_db"
    [[ -n "$_user" ]] && MYSQL_USER="$_user"
    [[ -n "$_root" ]] && MYSQL_ROOT_PASSWORD="$_root"
    if [[ -n "$MYSQL_PASSWORD" ]]; then
      echo "[guartrix] Reusing panel MySQL credentials from container guartrix-mysql"
    fi
    unset _denv _db _user _root
  fi
  if [[ -z "$MYSQL_PASSWORD" && -f "${INSTALL_DIR}/.env" ]]; then
    MYSQL_PASSWORD="$(grep -E '^MYSQL_PASSWORD=' "${INSTALL_DIR}/.env" | head -1 | cut -d= -f2- || true)"
    _db="$(grep -E '^MYSQL_DATABASE=' "${INSTALL_DIR}/.env" | head -1 | cut -d= -f2- || true)"
    _user="$(grep -E '^MYSQL_USER=' "${INSTALL_DIR}/.env" | head -1 | cut -d= -f2- || true)"
    [[ -n "$_db" ]] && MYSQL_DATABASE="$_db"
    [[ -n "$_user" ]] && MYSQL_USER="$_user"
    if [[ -n "$MYSQL_PASSWORD" ]]; then
      echo "[guartrix] Reusing panel MySQL password from ${INSTALL_DIR}/.env"
    fi
    unset _db _user
  fi
  if [[ -z "$MYSQL_PASSWORD" ]]; then
    MYSQL_PASSWORD="$(openssl rand -hex 24)"
  fi
  enc_user="$(uri_encode "$MYSQL_USER")"
  enc_pass="$(uri_encode "$MYSQL_PASSWORD")"
  DATABASE_URL="mysql://${enc_user}:${enc_pass}@127.0.0.1:3306/${MYSQL_DATABASE}"
  echo "[guartrix] Panel DB: Docker MySQL (guartrix-mysql on 127.0.0.1:3306)"
fi

# Resolve Redis URL for .env
REDIS_URL_OUT=""
SESSION_STORE_OUT=file
RATE_LIMIT_STORE_OUT=file
if [[ "$REDIS_MODE" == "docker" ]]; then
  REDIS_URL_OUT="redis://127.0.0.1:6379/0"
  SESSION_STORE_OUT=redis
  RATE_LIMIT_STORE_OUT=redis
elif [[ "$REDIS_MODE" == "external" ]]; then
  if [[ -z "$REDIS_URL_IN" ]]; then
    echo "ERROR: --redis-external needs --redis-url (or GUARTRIX_REDIS_URL)." >&2
    exit 1
  fi
  REDIS_URL_OUT="$REDIS_URL_IN"
  SESSION_STORE_OUT=redis
  RATE_LIMIT_STORE_OUT=redis
fi

echo "[guartrix] Cloning ${REPO_URL} (${BRANCH}) → ${INSTALL_DIR}"
mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  # Installer-managed tree: always match origin (local diverged commits break --ff-only).
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout -B "$BRANCH" "origin/${BRANCH}"
else
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
mkdir -p data/servers data/backups data/sessions data/logs data/run data/mail-outbox data/licenses cert
chmod 700 data

# Always seed signing-public.pem (localhost / git clone / any host) so Admin → License works.
# shellcheck source=./lib-license-public-key.sh
source "${INSTALL_DIR}/scripts/lib-license-public-key.sh"
guartrix_ensure_license_signing_public_pem "$INSTALL_DIR" "${INSTALL_DIR}/data"

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
# Panel validates against Guartrix's public license API
LICENSE_SERVER_URL=https://license.guartrix.com
SKIP_LOCAL_DAEMON=${SKIP_LOCAL_DAEMON}
SESSION_STORE=${SESSION_STORE_OUT}
RATE_LIMIT_STORE=${RATE_LIMIT_STORE_OUT}
EOF
if [[ -n "$REDIS_URL_OUT" ]]; then
  printf 'REDIS_URL=%s\n' "$REDIS_URL_OUT" >> .env
  printf 'REDIS_ENABLED=1\n' >> .env
fi
if [[ -n "$LICENSE_KEY" ]]; then
  printf 'LICENSE_KEY=%s\n' "$LICENSE_KEY" >> .env
fi
chmod 600 .env

# Local daemon env (token filled on first API start / ensureLocalNode)
if [[ "$SKIP_LOCAL_DAEMON" -eq 0 ]]; then
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
else
  echo "[guartrix] Panel-only: not writing data/daemon.env (no local daemon)"
fi

echo "[guartrix] npm install + build…"
npm install
# Prisma client must exist before `tsc` — otherwise @prisma/client exports are empty
# and the API build fails with dozens of TS7006 / TS2305 errors.
npm run db:generate -w @guartrix/api
if [[ -f apps/api/src/index.ts ]]; then
  npm run build
  # Single-file daemon + data/downloads/guartrix-daemon-*.zip for Add-node
  echo "[guartrix] Publishing daemon install bundle for remote nodes…"
  node scripts/bundle-daemon-for-nodes.mjs
elif [[ -f apps/api/dist/index.js && -f apps/web/dist/index.html ]]; then
  echo "[guartrix] Using prebuilt release bundles (no TypeScript sources)"
  node scripts/bundle-daemon-for-nodes.mjs 2>/dev/null || \
    echo "[guartrix] WARN: could not refresh daemon install zip — Add-node may need a rebuild" >&2
else
  echo "[guartrix] ERROR: no sources and no prebuilt dist — cannot continue" >&2
  exit 1
fi

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
    # Verify credentials work; if not, wipe container + data and recreate with current .env password.
    if ! docker exec guartrix-mysql mysqladmin ping -h 127.0.0.1 -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" --silent 2>/dev/null; then
      echo "[guartrix] Existing MySQL rejects current password — recreating container + data volume…"
      docker rm -f guartrix-mysql 2>/dev/null || true
      rm -rf "${INSTALL_DIR}/data/mysql"
      mkdir -p "${INSTALL_DIR}/data/mysql"
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
    fi
  fi
else
  echo "[guartrix] Skipping Docker MySQL — using external panel database"
  echo "[guartrix] Ensure database '${MYSQL_DATABASE}' and user '${MYSQL_USER}' already exist with rights."
fi

if [[ "$REDIS_MODE" == "docker" ]]; then
  mkdir -p "${INSTALL_DIR}/data/redis"
  docker network create guartrix 2>/dev/null || true
  if ! docker ps --format '{{.Names}}' | grep -qx guartrix-redis; then
    echo "[guartrix] Starting Redis container (guartrix-redis)…"
    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx guartrix-redis; then
      docker start guartrix-redis
    else
      docker run -d --name guartrix-redis --restart unless-stopped \
        --network guartrix \
        -p 127.0.0.1:6379:6379 \
        -v "${INSTALL_DIR}/data/redis:/data" \
        redis:7-alpine \
        redis-server --appendonly yes
    fi
    echo "[guartrix] Waiting for Redis…"
    for i in $(seq 1 30); do
      if docker exec guartrix-redis redis-cli ping 2>/dev/null | grep -qi PONG; then
        break
      fi
      sleep 1
    done
  else
    echo "[guartrix] Redis container guartrix-redis already running — reusing"
  fi
  echo "[guartrix] Redis: Docker (guartrix-redis on 127.0.0.1:6379)"
elif [[ "$REDIS_MODE" == "external" ]]; then
  echo "[guartrix] Redis: external (${REDIS_URL_OUT})"
else
  echo "[guartrix] Redis: skipped (file sessions / rate limits)"
fi

# Prisma CLI loads apps/api/.env (next to prisma/), not the panel root .env.
# Also export DATABASE_URL so migrate works even without a dotenv file.
if [[ ! -e apps/api/.env ]]; then
  ln -sfn ../../.env apps/api/.env
fi
if [[ -z "${DATABASE_URL:-}" && -f .env ]]; then
  # Resume / partial re-run: recover from the file we wrote earlier
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- || true)"
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set (check ${INSTALL_DIR}/.env)." >&2
  exit 1
fi
export DATABASE_URL
echo "[guartrix] Applying database migrations (prisma migrate deploy)…"
bash scripts/db-migrate.sh

# systemd units
if [[ "$SKIP_LOCAL_DAEMON" -eq 0 ]]; then
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
  API_AFTER="After=network-online.target guartrix-daemon.service docker.service"
else
  rm -f /etc/systemd/system/guartrix-daemon.service
  API_AFTER="After=network-online.target docker.service"
fi

cat > /etc/systemd/system/guartrix-api.service <<EOF
[Unit]
Description=Guartrix panel API
${API_AFTER}
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
  if [[ "$SKIP_LOCAL_DAEMON" -eq 0 ]]; then
    ufw allow 2022/tcp >/dev/null 2>&1 || true
    ufw allow 25565:25600/tcp >/dev/null 2>&1 || true
    ufw allow 19132:19332/udp >/dev/null 2>&1 || true
    ufw allow 25565:25600/udp >/dev/null 2>&1 || true
  fi
fi

if [[ "$SKIP_START" -eq 0 ]]; then
  if [[ "$SKIP_LOCAL_DAEMON" -eq 0 ]]; then
    systemctl enable --now guartrix-daemon.service guartrix-api.service guartrix-web.service
  else
    systemctl enable --now guartrix-api.service guartrix-web.service
    systemctl disable --now guartrix-daemon.service 2>/dev/null || true
  fi
  # Prefer start.sh for first boot (writes daemon token via API when local daemon is on)
  sleep 2
  bash "${INSTALL_DIR}/scripts/start.sh" || true
fi

echo
echo "=============================================="
echo " Guartrix installed (role: ${INSTALL_ROLE})"
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
  if [[ "$SKIP_LOCAL_DAEMON" -eq 0 && "$DAEMON_MYSQL_PORT" != "3306" ]]; then
    echo " Game MySQL (daemon Docker): 127.0.0.1:${DAEMON_MYSQL_PORT}"
  fi
fi
if [[ "$SKIP_LOCAL_DAEMON" -eq 1 ]]; then
  echo " Local daemon: skipped — add game nodes via System → Add node"
else
  echo " Add extra nodes: System → Add node → Install via SSH"
fi
echo "=============================================="
