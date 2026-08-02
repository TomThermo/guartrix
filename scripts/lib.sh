#!/usr/bin/env bash
# Shared functions for scripts/start.sh and scripts/monitor.sh.
# NOTE: does not set `set -e` itself — the sourcing script decides that,
# since the watchdog must survive failing commands instead of dying.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Sibling operator checkout (outside the GitHub panel repo). Override with LICENSE_SERVER_HOME.
# When ROOT is ./build (build-out), the sibling sits next to the panel checkout (../..).
resolve_license_server_home() {
  local candidate
  if [[ -n "${LICENSE_SERVER_HOME:-}" ]]; then
    LICENSE_SERVER_HOME="$(cd "$LICENSE_SERVER_HOME" 2>/dev/null && pwd || echo "$LICENSE_SERVER_HOME")"
  else
    for candidate in \
      "$ROOT/../guartrix-license-server" \
      "$ROOT/../../guartrix-license-server"
    do
      if [[ -d "$candidate" ]]; then
        LICENSE_SERVER_HOME="$(cd "$candidate" && pwd)"
        break
      fi
    done
  fi
  if [[ -n "${LICENSE_SERVER_HOME:-}" ]]; then
    LICENSE_SERVER_ENTRY="$LICENSE_SERVER_HOME/dist/index.js"
  else
    LICENSE_SERVER_ENTRY=""
  fi
}
resolve_license_server_home

LOG_DIR="${LOG_DIR:-$ROOT/data/logs}"
mkdir -p "$LOG_DIR"
DAEMON_LOG="${LOG_DIR}/guartrix-daemon.log"
API_LOG="${LOG_DIR}/guartrix-api.log"
WEB_LOG="${LOG_DIR}/guartrix-web.log"
LICENSE_LOG="${LOG_DIR}/guartrix-license.log"
MONITOR_LOG="${LOG_DIR}/guartrix-monitor.log"
PID_DIR="$ROOT/data/run"
mkdir -p "$PID_DIR"

# Load .env into this shell (without overriding already-set vars)
load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%"${line##*[![:space:]]}"}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" != *=* ]] && continue
    local key="${line%%=*}"
    local val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    val="${val#"${val%%[![:space:]]*}"}"
    if [[ "${val}" == \"*\" && "${val}" == *\" ]]; then
      val="${val:1:-1}"
    elif [[ "${val}" == \'*\' && "${val}" == *\' ]]; then
      val="${val:1:-1}"
    fi
    if [[ -z "${!key+x}" ]]; then
      export "$key=$val"
    fi
  done < "$file"
}

# Same as load_env_file but always overwrites (for standalone license.env).
load_env_file_force() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%"${line##*[![:space:]]}"}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" != *=* ]] && continue
    local key="${line%%=*}"
    local val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    val="${val#"${val%%[![:space:]]*}"}"
    if [[ "${val}" == \"*\" && "${val}" == *\" ]]; then
      val="${val:1:-1}"
    elif [[ "${val}" == \'*\' && "${val}" == *\' ]]; then
      val="${val:1:-1}"
    fi
    export "$key=$val"
  done < "$file"
}

load_env_file "$ROOT/.env"
load_env_file "$ROOT/data/daemon.env"
# License server is standalone — bind/secret live in data/license.env only.
load_env_file_force "$ROOT/data/license.env"
# Re-resolve after .env (LICENSE_SERVER_HOME may be set there)
resolve_license_server_home

API_PORT="${API_PORT:-3001}"
DAEMON_PORT="${DAEMON_PORT:-8081}"
DAEMON_HOST="${DAEMON_HOST:-127.0.0.1}"
LICENSE_SERVER_PORT="${LICENSE_SERVER_PORT:-4040}"
LICENSE_SERVER_HOST="${LICENSE_SERVER_HOST:-0.0.0.0}"
LICENSE_UI_PORT="${LICENSE_UI_PORT:-4041}"
LICENSE_UI_HOST="${LICENSE_UI_HOST:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-80}"
HTTPS_PORT="${HTTPS_PORT:-443}"
HTTPS_ENABLED="${HTTPS_ENABLED:-true}"
WEB_HOST="${WEB_HOST:-0.0.0.0}"
API_PROXY_HOST="${API_PROXY_HOST:-127.0.0.1}"
PUBLIC_HOST="${PUBLIC_HOST:-127.0.0.1}"
MANAGE_FIREWALL="${MANAGE_FIREWALL:-true}"

info()  { echo "[guartrix] $*"; }
warn()  { echo "[guartrix] WARN: $*" >&2; }
fail()  { echo "[guartrix] ERROR: $*" >&2; exit 1; }

port_pids() {
  local port="$1"
  ss -tlnp 2>/dev/null | sed -n "s/.*:${port} .*pid=\([0-9]*\).*/\1/p" | sort -u
}

kill_pids() {
  local p
  for p in "$@"; do
    [[ -z "$p" ]] && continue
    kill "$p" 2>/dev/null || true
  done
}

wait_dead() {
  local p
  local i
  for i in $(seq 1 20); do
    local alive=0
    for p in "$@"; do
      [[ -z "$p" ]] && continue
      if kill -0 "$p" 2>/dev/null; then
        alive=1
        break
      fi
    done
    [[ "$alive" -eq 0 ]] && return 0
    sleep 0.25
  done
  for p in "$@"; do
    [[ -z "$p" ]] && continue
    kill -9 "$p" 2>/dev/null || true
  done
}

stop_old() {
  info "Stopping old Guartrix processes…"

  local pids=()
  local p port

  for port in "$API_PORT" "$DAEMON_PORT"; do
    while IFS= read -r p; do
      [[ -n "$p" ]] && pids+=("$p")
    done < <(port_pids "$port")
  done
  if [[ "${SKIP_LOCAL_LICENSE_SERVER:-0}" != "1" && "${SKIP_LOCAL_LICENSE_SERVER:-}" != "true" ]]; then
    while IFS= read -r p; do
      [[ -n "$p" ]] && pids+=("$p")
    done < <(port_pids "$LICENSE_SERVER_PORT")
    while IFS= read -r p; do
      [[ -n "$p" ]] && pids+=("$p")
    done < <(port_pids "$LICENSE_UI_PORT")
  fi

  # Privileged web ports may need sudo to see/kill
  for port in "$WEB_PORT" "$HTTPS_PORT"; do
    [[ -z "$port" || "$port" == "0" ]] && continue
    while IFS= read -r p; do
      [[ -n "$p" ]] && pids+=("$p")
    done < <(port_pids "$port")
    if command -v sudo >/dev/null 2>&1; then
      sudo -n fuser -k "${port}/tcp" 2>/dev/null || true
    else
      fuser -k "${port}/tcp" 2>/dev/null || true
    fi
  done

  # Known launch patterns (panel only — not Minecraft Docker containers)
  while IFS= read -r p; do
    [[ -n "$p" ]] && pids+=("$p")
  done < <(
    pgrep -f "$ROOT/scripts/prod-web.mjs" 2>/dev/null || true
    pgrep -f "$ROOT/scripts/start-prod.mjs" 2>/dev/null || true
    pgrep -f "$ROOT/apps/daemon/dist/index.js" 2>/dev/null || true
    if [[ -n "${LICENSE_SERVER_ENTRY:-}" ]]; then
      pgrep -f "$LICENSE_SERVER_ENTRY" 2>/dev/null || true
    fi
  )

  # API node processes whose cwd is apps/api
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    local cwd
    cwd="$(readlink "/proc/$p/cwd" 2>/dev/null || true)"
    if [[ "$cwd" == "$ROOT/apps/api" ]]; then
      pids+=("$p")
    fi
  done < <(pgrep -f 'node dist/index.js' 2>/dev/null || true)

  # Previous watchdog instance (never matches ourselves, so the watchdog can
  # safely call stop_old from within its own restart loop)
  while IFS= read -r p; do
    [[ -n "$p" && "$p" != "$$" ]] && pids+=("$p")
  done < <(pgrep -f "$ROOT/scripts/monitor.sh" 2>/dev/null || true)

  if [[ ${#pids[@]} -gt 0 ]]; then
    # unique
    mapfile -t pids < <(printf '%s\n' "${pids[@]}" | awk 'NF' | sort -u)
    info "Sending SIGTERM to: ${pids[*]}"
    kill_pids "${pids[@]}"
    wait_dead "${pids[@]}"
  fi

  # Clear stale pid files (monitor.pid is left alone — ensure_monitor manages it)
  rm -f "$PID_DIR"/{daemon,api,web,license}.pid

  # Confirm panel ports free (Minecraft game ports are left alone)
  for port in "$API_PORT" "$DAEMON_PORT"; do
    if [[ -n "$(port_pids "$port")" ]]; then
      fail "Port $port is still in use after stop"
    fi
  done
  if [[ "${SKIP_LOCAL_LICENSE_SERVER:-0}" != "1" && "${SKIP_LOCAL_LICENSE_SERVER:-}" != "true" ]]; then
    if [[ -n "$(port_pids "$LICENSE_SERVER_PORT")" ]]; then
      fail "Port $LICENSE_SERVER_PORT is still in use after stop"
    fi
    if [[ -n "$(port_pids "$LICENSE_UI_PORT")" ]]; then
      fail "Port $LICENSE_UI_PORT is still in use after stop"
    fi
  fi
  info "Old processes stopped"
}

preflight() {
  info "Preflight checks…"

  command -v node >/dev/null || fail "node not found"
  command -v npm >/dev/null || fail "npm not found"
  command -v curl >/dev/null || fail "curl not found"
  command -v ss >/dev/null || fail "ss not found (iproute2)"

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$node_major" -lt 22 ]]; then
    fail "Node.js 22+ required (found $(node -v))"
  fi

  [[ -f "$ROOT/.env" ]] || fail "Missing .env — copy from .env.example"

  [[ -f "$ROOT/apps/api/dist/index.js" ]] || fail "API build missing — run: npm run build"
  [[ -f "$ROOT/apps/web/dist/index.html" ]] || fail "Web build missing — run: npm run build"
  if [[ "${SKIP_LOCAL_DAEMON:-0}" != "1" && "${SKIP_LOCAL_DAEMON:-}" != "true" ]]; then
    [[ -f "$ROOT/apps/daemon/dist/index.js" ]] || fail "Daemon build missing — run: npm run build"
  fi
  if [[ "${SKIP_LOCAL_LICENSE_SERVER:-0}" != "1" && "${SKIP_LOCAL_LICENSE_SERVER:-}" != "true" ]]; then
    if [[ -z "${LICENSE_SERVER_HOME:-}" || ! -f "${LICENSE_SERVER_ENTRY:-}" ]]; then
      fail "Local license server dist missing (LICENSE_SERVER_HOME=${LICENSE_SERVER_HOME:-unset}/dist/index.js). Checkout/build the sibling guartrix-license-server repo, set LICENSE_SERVER_HOME, or set SKIP_LOCAL_LICENSE_SERVER=1 to use LICENSE_SERVER_URL."
    fi
  fi

  if ! command -v docker >/dev/null 2>&1; then
    fail "docker not found"
  fi
  if ! docker info >/dev/null 2>&1 && ! sudo -n docker info >/dev/null 2>&1; then
    fail "Docker not reachable (is the daemon running?)"
  fi

  # Ensure daemon.env exists (token etc.) — skip when panel-only (no local daemon)
  if [[ "${SKIP_LOCAL_DAEMON:-0}" != "1" && "${SKIP_LOCAL_DAEMON:-}" != "true" ]]; then
    if [[ ! -f "$ROOT/data/daemon.env" ]]; then
      info "Creating data/daemon.env via start-prod helper…"
      mkdir -p "$ROOT/data"
      local token
      token="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32)"
      cat > "$ROOT/data/daemon.env" <<EOF
# Generated by scripts/start.sh
DAEMON_TOKEN=${DAEMON_TOKEN:-$token}
DAEMON_PORT=${DAEMON_PORT}
DAEMON_HOST=${DAEMON_HOST}
DATA_DIR=$ROOT/data
PUBLIC_HOST=${PUBLIC_HOST}
DOCKER_IMAGE=${DOCKER_IMAGE:-eclipse-temurin:25-jre-jammy}
MYSQL_PORT=${MYSQL_PORT:-3306}
EOF
      chmod 600 "$ROOT/data/daemon.env"
    fi
    load_env_file "$ROOT/data/daemon.env"
    [[ -n "${DAEMON_TOKEN:-}" ]] || fail "DAEMON_TOKEN missing in data/daemon.env"
  fi

  local needs_root=0
  if [[ "$WEB_PORT" -gt 0 && "$WEB_PORT" -lt 1024 ]]; then needs_root=1; fi
  if [[ "${HTTPS_ENABLED}" != "0" && "${HTTPS_ENABLED}" != "false" && "$HTTPS_PORT" -gt 0 && "$HTTPS_PORT" -lt 1024 ]]; then
    needs_root=1
  fi
  if [[ "$needs_root" -eq 1 ]]; then
    if ! sudo -n true 2>/dev/null; then
      fail "Web ports <1024 need passwordless sudo (or set WEB_PORT=8080)"
    fi
  fi

  info "Preflight OK (Node $(node -v), API :$API_PORT, daemon :$DAEMON_PORT, license-api :$LICENSE_SERVER_PORT, license-ui :$LICENSE_UI_PORT, web :$WEB_PORT)"
}

wait_http() {
  local url="$1"
  local name="$2"
  local tries="${3:-40}"
  local i code
  for i in $(seq 1 "$tries"); do
    code="$(curl -sS -m 2 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)"
    if [[ "$code" == "200" ]]; then
      info "$name healthy ($url)"
      return 0
    fi
    sleep 0.5
  done
  fail "$name did not become healthy: $url (last HTTP $code) — see logs"
}

start_services() {
  # Refresh env after possible daemon.env create
  set -a
  # shellcheck disable=SC1091
  [[ -f "$ROOT/.env" ]] && . "$ROOT/.env"
  # shellcheck disable=SC1091
  [[ -f "$ROOT/data/daemon.env" ]] && . "$ROOT/data/daemon.env"
  set +a
  resolve_license_server_home

  info "Starting license server…"
  if [[ "${SKIP_LOCAL_LICENSE_SERVER:-0}" == "1" || "${SKIP_LOCAL_LICENSE_SERVER:-}" == "true" ]]; then
    info "Skipping local license server (SKIP_LOCAL_LICENSE_SERVER=1) — panel will use LICENSE_SERVER_URL"
  else
    (
      cd "$LICENSE_SERVER_HOME"
      nohup env GUARTRIX_PANEL_ROOT="$ROOT" node "$LICENSE_SERVER_ENTRY" >>"$LICENSE_LOG" 2>&1 &
      echo $! >"$PID_DIR/license.pid"
    )
    wait_http "http://127.0.0.1:${LICENSE_SERVER_PORT}/health" "license-api"
    wait_http "http://127.0.0.1:${LICENSE_UI_PORT}/health" "license-ui"
  fi

  info "Starting daemon…"
  if [[ "${SKIP_LOCAL_DAEMON:-0}" == "1" || "${SKIP_LOCAL_DAEMON:-}" == "true" ]]; then
    info "Skipping local daemon (SKIP_LOCAL_DAEMON=1) — add remote nodes in the panel"
  else
    nohup node "$ROOT/apps/daemon/dist/index.js" >>"$DAEMON_LOG" 2>&1 &
    echo $! >"$PID_DIR/daemon.pid"
    wait_http "http://${DAEMON_HOST}:${DAEMON_PORT}/health" "daemon"
  fi

  # Start web before the API so HTTPS Host proxies (license.* / DAEMON_PUBLIC_HOST)
  # are already up when the API validates the license and talks to the local node.
  info "Starting web (client)…"
  local needs_root=0
  if [[ "$WEB_PORT" -gt 0 && "$WEB_PORT" -lt 1024 ]]; then needs_root=1; fi
  if [[ "${HTTPS_ENABLED}" != "0" && "${HTTPS_ENABLED}" != "false" && "$HTTPS_PORT" -gt 0 && "$HTTPS_PORT" -lt 1024 ]]; then
    needs_root=1
  fi

  if [[ "$needs_root" -eq 1 ]]; then
    nohup sudo -n env \
      "WEB_PORT=${WEB_PORT}" \
      "HTTPS_PORT=${HTTPS_PORT}" \
      "HTTPS_ENABLED=${HTTPS_ENABLED}" \
      "WEB_HOST=${WEB_HOST}" \
      "API_PORT=${API_PORT}" \
      "API_PROXY_HOST=${API_PROXY_HOST}" \
      "PUBLIC_HOST=${PUBLIC_HOST}" \
      "MANAGE_FIREWALL=${MANAGE_FIREWALL}" \
      "HOME=${HOME}" \
      node "$ROOT/scripts/prod-web.mjs" >>"$WEB_LOG" 2>&1 &
    echo $! >"$PID_DIR/web.pid"
  else
    nohup node "$ROOT/scripts/prod-web.mjs" >>"$WEB_LOG" 2>&1 &
    echo $! >"$PID_DIR/web.pid"
  fi

  wait_http "http://127.0.0.1:${WEB_PORT}/" "web"

  info "Starting API…"
  (
    cd "$ROOT/apps/api"
    # Prefer IPv4 for outbound HTTPS — broken IPv6 makes Modrinth (undici) hang.
    if [[ "${NODE_OPTIONS:-}" != *dns-result-order* ]]; then
      export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first"
    fi
    nohup node dist/index.js >>"$API_LOG" 2>&1 &
    echo $! >"$PID_DIR/api.pid"
  )
  wait_http "http://127.0.0.1:${API_PORT}/api/health" "API"

  # Proxy path must reach API
  local proxy_code
  proxy_code="$(curl -sS -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${WEB_PORT}/api/health" || true)"
  [[ "$proxy_code" == "200" ]] || fail "Web→API proxy failed (HTTP $proxy_code)"
  info "Web→API proxy OK"
}

# Launch the watchdog (scripts/monitor.sh) in the background unless it's
# already running, or NO_MONITOR=1 is set. Safe to call every time start.sh
# runs — stop_old already terminated any previous watchdog instance.
ensure_monitor() {
  if [[ "${NO_MONITOR:-0}" == "1" ]]; then
    info "Watchdog disabled via NO_MONITOR=1"
    return 0
  fi
  info "Starting watchdog…"
  nohup "$ROOT/scripts/monitor.sh" >>"$MONITOR_LOG" 2>&1 &
  disown 2>/dev/null || true
  echo $! >"$PID_DIR/monitor.pid"
  sleep 0.3
  if kill -0 "$(cat "$PID_DIR/monitor.pid" 2>/dev/null)" 2>/dev/null; then
    info "Watchdog running (pid $(cat "$PID_DIR/monitor.pid"), log $MONITOR_LOG)"
  else
    warn "Watchdog failed to start — see $MONITOR_LOG"
  fi
}

summary() {
  echo
  info "All services up"
  if [[ "${SKIP_LOCAL_LICENSE_SERVER:-0}" == "1" || "${SKIP_LOCAL_LICENSE_SERVER:-}" == "true" ]]; then
    info "  license remote (SKIP_LOCAL_LICENSE_SERVER=1) — set URL in Admin → License or LICENSE_SERVER_URL"
  else
    info "  license-api http://${PUBLIC_IP:-127.0.0.1}:${LICENSE_SERVER_PORT}/health (bind ${LICENSE_SERVER_HOST})"
    info "  license-ui  http://${LICENSE_UI_HOST}:${LICENSE_UI_PORT}/ (admin console)"
  fi
  if [[ "${SKIP_LOCAL_DAEMON:-0}" == "1" || "${SKIP_LOCAL_DAEMON:-}" == "true" ]]; then
    info "  daemon  skipped (SKIP_LOCAL_DAEMON=1) — add remote nodes in the panel"
  else
    info "  daemon  http://${DAEMON_HOST}:${DAEMON_PORT}/health"
  fi
  info "  API     http://127.0.0.1:${API_PORT}/api/health"
  info "  web     http://${PUBLIC_HOST}:${WEB_PORT}/"
  info "  logs    $LICENSE_LOG | $DAEMON_LOG | $API_LOG | $WEB_LOG | $MONITOR_LOG"
  info "  pids    $PID_DIR/"
}
