#!/usr/bin/env bash
# Guartrix watchdog.
#
# Runs forever in the background (started automatically by scripts/start.sh).
# Every MONITOR_INTERVAL seconds it checks:
#   - the Docker engine is reachable (alerts if not — never restarts docker.service)
#   - the license / daemon / API / web processes are alive AND answering health checks
# If the panel stack is unhealthy it restarts daemon+API+web (and local license
# when SKIP_LOCAL_LICENSE_SERVER is off) via the same stop_old/preflight/start_services
# functions scripts/start.sh uses.
#
# Never touches Minecraft server containers directly — only the panel
# processes (license, daemon, API, web) and the Docker engine itself.
#
# Deliberately does NOT use `set -e`: a single failed command (e.g. a curl
# timeout) must never kill the watchdog.
set -uo pipefail

# shellcheck source=./lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

CHECK_INTERVAL="${MONITOR_INTERVAL:-20}"        # seconds between health checks
MAX_RESTARTS_PER_HOUR="${MONITOR_MAX_RESTARTS:-6}"
BACKOFF_SECONDS="${MONITOR_BACKOFF:-300}"        # cool-down once restarts loop

echo $$ >"$PID_DIR/monitor.pid"

mlog() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [watchdog] $*"; }

mlog "Watchdog started (pid $$) — checking every ${CHECK_INTERVAL}s"

docker_alive() {
  docker info >/dev/null 2>&1 || sudo -n docker info >/dev/null 2>&1
}

ensure_docker() {
  docker_alive && return 0
  # Do NOT restart docker.service automatically — that kills every Minecraft
  # container (they use --rm and have no restart policy). Alert only.
  mlog "ERROR: Docker engine unreachable — NOT restarting docker.service (would wipe game servers). Fix Docker manually."
  return 1
}

pid_alive() {
  local file="$1" pid
  [[ -f "$file" ]] || return 1
  pid="$(cat "$file" 2>/dev/null || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

http_ok() {
  local code
  code="$(curl -sS -m 3 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true)"
  [[ "$code" == "200" ]]
}

stack_healthy() {
  if [[ "${SKIP_LOCAL_LICENSE_SERVER:-0}" != "1" && "${SKIP_LOCAL_LICENSE_SERVER:-}" != "true" ]]; then
    pid_alive "$PID_DIR/license.pid" || { mlog "license process is not running"; return 1; }
    http_ok "http://127.0.0.1:${LICENSE_SERVER_PORT}/health" || { mlog "license API health check failed"; return 1; }
    http_ok "http://127.0.0.1:${LICENSE_UI_PORT}/health" || { mlog "license UI health check failed"; return 1; }
  fi
  if [[ "${SKIP_LOCAL_DAEMON:-0}" != "1" && "${SKIP_LOCAL_DAEMON:-}" != "true" ]]; then
    pid_alive "$PID_DIR/daemon.pid" || { mlog "daemon process is not running"; return 1; }
    http_ok "http://${DAEMON_HOST}:${DAEMON_PORT}/health" || { mlog "daemon health check failed"; return 1; }
  fi
  pid_alive "$PID_DIR/api.pid" || { mlog "API process is not running"; return 1; }
  pid_alive "$PID_DIR/web.pid" || { mlog "web process is not running"; return 1; }
  http_ok "http://127.0.0.1:${API_PORT}/api/health" || { mlog "API health check failed"; return 1; }
  http_ok "http://127.0.0.1:${WEB_PORT}/" || { mlog "web health check failed"; return 1; }
  return 0
}

restart_times=()

prune_restart_times() {
  local now="$1" t
  local kept=()
  for t in "${restart_times[@]}"; do
    if (( now - t < 3600 )); then
      kept+=("$t")
    fi
  done
  restart_times=("${kept[@]}")
}

notify_panel_alert() {
  local reason="$1"
  local url="${ACTIVITY_WEBHOOK_URL:-}"
  [[ -n "$url" ]] || return 0
  local host="${PUBLIC_HOST:-guartrix}"
  # Discord-compatible payload; generic receivers can ignore unused fields.
  curl -sS -m 8 -X POST "$url" \
    -H "Content-Type: application/json" \
    --data-binary @- >/dev/null 2>&1 <<EOF || true
{"content":"Guartrix panel alert on ${host}: ${reason}","embeds":[{"title":"Panel outage / restart","description":"${reason}","color":15158332}]}
EOF
}

restart_stack() {
  local now reason="${1:-unhealthy stack}"
  now="$(date +%s)"
  prune_restart_times "$now"
  restart_times+=("$now")

  notify_panel_alert "$reason — restarting license/daemon/API/web"

  if (( ${#restart_times[@]} > MAX_RESTARTS_PER_HOUR )); then
    mlog "CRITICAL: ${#restart_times[@]} restarts in the last hour — backing off ${BACKOFF_SECONDS}s before trying again"
    notify_panel_alert "CRITICAL: too many restarts (${#restart_times[@]}/h) — backing off ${BACKOFF_SECONDS}s"
    sleep "$BACKOFF_SECONDS"
    return
  fi

  mlog "Unhealthy stack detected — restarting license/daemon/API/web…"
  # Subshell isolation: fail() inside lib.sh calls `exit`, which must only
  # end this subshell, never the watchdog's own long-running process.
  if ( stop_old && preflight && start_services ); then
    mlog "Restart succeeded"
    notify_panel_alert "Panel stack restarted successfully after: ${reason}"
  else
    mlog "ERROR: restart attempt failed — will retry on next check"
    notify_panel_alert "ERROR: panel restart failed after: ${reason}"
  fi
}

trap 'mlog "Watchdog stopping (signal received)"; exit 0' TERM INT

while true; do
  ensure_docker
  if ! stack_healthy; then
    restart_stack "health check failed"
  fi
  sleep "$CHECK_INTERVAL"
done
