#!/usr/bin/env bash
# Secret rotation drill (operator). Does not rotate live secrets automatically.
# Usage:
#   bash scripts/sla-secret-rotation-drill.sh                    # checklist only
#   bash scripts/sla-secret-rotation-drill.sh --live             # live smoke + checklist
#   bash scripts/sla-secret-rotation-drill.sh --live --backup-first
#   bash scripts/sla-secret-rotation-drill.sh --live --attest    # smoke OK → Go-live date
#   bash scripts/sla-secret-rotation-drill.sh --smoke-only       # post-restart verification
# See docs/wiki/security.md and docs/wiki/sla-ops.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LIVE=0
ATTEST=0
BACKUP_FIRST=0
SMOKE_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --live) LIVE=1 ;;
    --attest) ATTEST=1 ;;
    --backup-first) BACKUP_FIRST=1 ;;
    --smoke-only) LIVE=1; SMOKE_ONLY=1 ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "[sla-secret-rotation] Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

if [[ "$ATTEST" -eq 1 && "$LIVE" -eq 0 ]]; then
  LIVE=1
fi

# shellcheck source=./lib.sh
if [[ -f "$ROOT/scripts/lib.sh" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/scripts/lib.sh"
else
  load_env_file() { [[ -f "$1" ]] && set -a && source "$1" && set +a || true; }
  load_env_file "$ROOT/.env"
  load_env_file "$ROOT/data/daemon.env"
  API_PORT="${API_PORT:-3001}"
  DAEMON_PORT="${DAEMON_PORT:-8081}"
  DAEMON_HOST="${DAEMON_HOST:-127.0.0.1}"
  WEB_PORT="${WEB_PORT:-80}"
  SKIP_LOCAL_DAEMON="${SKIP_LOCAL_DAEMON:-0}"
fi

SETTINGS_FILE="$ROOT/data/panel-settings.json"
SMOKE_FAIL=0

read_attest_date() {
  node -e "
    const fs = require('fs');
    const f = process.argv[1];
    try {
      const o = JSON.parse(fs.readFileSync(f, 'utf8'));
      process.stdout.write(o.slaSecretRotationAt ? String(o.slaSecretRotationAt).slice(0, 10) : '');
    } catch { process.stdout.write(''); }
  " "$SETTINGS_FILE" 2>/dev/null || true
}

env_secret_set() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 1
  local line val
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 1
  val="${line#*=}"
  val="${val%"${val##*[![:space:]]}"}"
  val="${val#"${val%%[![:space:]]*}"}"
  if [[ "$val" == \"*\" && "$val" == *\" ]]; then val="${val:1:-1}"; fi
  [[ -n "$val" && "$val" != "changeme" && "$val" != "replace-me" ]]
}

curl_ok() {
  local label="$1" url="$2"
  local code
  code="$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")"
  if [[ "$code" == "200" ]]; then
    echo "  [ok] $label ($url)"
    return 0
  fi
  echo "  [FAIL] $label ($url) HTTP $code" >&2
  SMOKE_FAIL=1
  return 1
}

run_live_smoke() {
  echo "[sla-secret-rotation] Live smoke (panel must be running after any secret rotation + restart)…"

  curl_ok "API health" "http://127.0.0.1:${API_PORT}/api/health" || true
  curl_ok "API ready" "http://127.0.0.1:${API_PORT}/api/ready" || true
  curl_ok "Web home" "http://127.0.0.1:${WEB_PORT}/" || true
  curl_ok "Web→API proxy" "http://127.0.0.1:${WEB_PORT}/api/health" || true

  if [[ "${SKIP_LOCAL_DAEMON:-0}" == "1" || "${SKIP_LOCAL_DAEMON:-}" == "true" ]]; then
    echo "  [skip] local daemon (SKIP_LOCAL_DAEMON=1) — check a remote node /health in Admin → Nodes"
  else
    curl_ok "Daemon health" "http://${DAEMON_HOST}:${DAEMON_PORT}/health" || true
  fi

  echo "[sla-secret-rotation] Secret presence (values not shown):"
  if env_secret_set "$ROOT/.env" SESSION_SECRET; then
    echo "  [ok] SESSION_SECRET set in .env"
  else
    echo "  [FAIL] SESSION_SECRET missing or placeholder in .env" >&2
    SMOKE_FAIL=1
  fi
  if env_secret_set "$ROOT/data/daemon.env" DAEMON_TOKEN; then
    echo "  [ok] DAEMON_TOKEN set in data/daemon.env"
  else
    echo "  [warn] DAEMON_TOKEN missing in data/daemon.env (remote-only daemon installs may omit local token)"
  fi

  local last
  last="$(read_attest_date)"
  if [[ -n "$last" ]]; then
    echo "[sla-secret-rotation] Last Go-live attestation: slaSecretRotationAt=$last"
  else
    echo "[sla-secret-rotation] No slaSecretRotationAt in panel-settings.json yet"
  fi

  if [[ "$SMOKE_FAIL" -eq 0 ]]; then
    echo "[sla-secret-rotation] Smoke passed — confirm login in the browser before attesting."
  else
    echo "[sla-secret-rotation] Smoke failed — fix services before attesting." >&2
    return 1
  fi
}

print_checklist() {
  if [[ "$LIVE" -eq 1 ]]; then
    cat <<'EOF'
[sla-secret-rotation] Drill checklist (live operator):

  [ ] Take a panel DB backup before rotating secrets (or use --backup-first)
  [ ] SESSION_SECRET — generate new value; restart all API replicas together
  [ ] Daemon node tokens — rotate via Admin → Nodes (or reinstall remote)
  [ ] SMTP / Discord webhook / Mollie keys — rotate at provider, update Admin Settings / .env
  [ ] Cloudflare API token — rotate + update Admin → Settings
  [ ] Application API keys (gta_) / Client API keys (gt_) — revoke unused; mint replacements
  [ ] License signing public key shipping unchanged; private PEM never in this repo
  [ ] bash scripts/sla-secret-rotation-drill.sh --smoke-only  (after restart)
  [ ] Record date: Admin → Go-live → secret rotation, or --live --attest

Never commit .env, data/daemon.env, or PEM private keys.
EOF
  else
    cat <<'EOF'
[sla-secret-rotation] Drill checklist (staging first):

  [ ] SESSION_SECRET — generate new value; restart all API replicas together
  [ ] Daemon node tokens — rotate via Admin → Nodes (or reinstall remote)
  [ ] SMTP / Discord webhook / Mollie keys — rotate at provider, update Admin Settings / .env
  [ ] Cloudflare API token — rotate + update Admin → Settings
  [ ] Application API keys (gta_) / Client API keys (gt_) — revoke unused; mint replacements
  [ ] License signing public key shipping unchanged; private PEM never in this repo
  [ ] Confirm login + one daemon /health after restart
  [ ] Record date in Admin → Settings → Go-live → secret rotation

On production after rotation: bash scripts/sla-secret-rotation-drill.sh --live --attest

Never commit .env, data/daemon.env, or PEM private keys.
EOF
  fi
}

if [[ "$BACKUP_FIRST" -eq 1 ]]; then
  echo "[sla-secret-rotation] Panel DB backup before rotation drill…"
  if [[ -x "$ROOT/scripts/backup-panel-db.sh" ]]; then
    bash "$ROOT/scripts/backup-panel-db.sh"
  else
    echo "  Missing scripts/backup-panel-db.sh" >&2
    exit 1
  fi
fi

if [[ "$SMOKE_ONLY" -eq 0 ]]; then
  print_checklist
  echo
fi

if [[ "$LIVE" -eq 1 ]]; then
  run_live_smoke || { [[ "$ATTEST" -eq 1 ]] && exit 1; }
fi

if [[ "$ATTEST" -eq 1 ]]; then
  if [[ "$SMOKE_FAIL" -ne 0 ]]; then
    echo "[sla-secret-rotation] Refusing --attest: smoke checks failed." >&2
    exit 1
  fi
  ROOT="$ROOT" DATA_DIR="$ROOT/data" node "$ROOT/scripts/lib/panel-settings-attest.mjs" slaSecretRotationAt
  echo "[sla-secret-rotation] Attestation saved — visible under Admin → Settings → Go-live."
fi
