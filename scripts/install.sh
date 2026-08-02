#!/usr/bin/env bash
# Guartrix one-shot installer entrypoint.
#
# Interactive (recommended — no flags):
#   curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
#
# When piped via curl, this downloads install-panel.sh and re-runs it with /dev/tty
# attached (required for prompts under curl|bash).
# Local checkouts use the sibling scripts/install-panel.sh.
#
# Optional flags / env: see install-panel.sh --help
# Non-interactive automation: GUARTRIX_NONINTERACTIVE=1 plus flags/env.
#
# Override fetch source:
#   GUARTRIX_INSTALL_PANEL=/path/to/install-panel.sh
#   GUARTRIX_INSTALL_REF=<git-sha-or-branch>   # pin raw.githubusercontent.com ref
#   GUARTRIX_INSTALL_RAW_BASE=https://…/scripts
set -euo pipefail

REPO_SLUG="${GUARTRIX_INSTALL_REPO:-TomThermo/guartrix}"
INSTALL_REF="${GUARTRIX_INSTALL_REF:-main}"
RAW_BASE="${GUARTRIX_INSTALL_RAW_BASE:-https://raw.githubusercontent.com/${REPO_SLUG}/${INSTALL_REF}/scripts}"
PANEL_SRC="${GUARTRIX_INSTALL_PANEL:-}"
MIN_PANEL_MARKER='INSTALLER_VERSION="1.0.10"'

ROOT=""
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || ROOT=""
fi

fetch_panel() {
  local url="$1"
  local dest="$2"
  # Bust GitHub raw CDN (max-age=300) — stale main was serving old install-panel.sh
  # while install.sh was already new, which hung the wizard after role choice.
  local bust
  bust="$(date +%s)"
  echo "[guartrix] Fetching installer from ${url} …"
  curl -fsSL \
    -H 'Cache-Control: no-cache' \
    -H 'Pragma: no-cache' \
    "${url}?t=${bust}" \
    -o "$dest"
}

panel_is_current() {
  local f="$1"
  grep -q "$MIN_PANEL_MARKER" "$f" 2>/dev/null || grep -q 'tty_out_nl' "$f" 2>/dev/null
}

PANEL=""
CLEANUP=""
if [[ -n "$PANEL_SRC" && -f "$PANEL_SRC" ]]; then
  PANEL="$PANEL_SRC"
elif [[ -n "$PANEL_SRC" && "$PANEL_SRC" == https://* ]]; then
  CLEANUP="$(mktemp)"
  fetch_panel "$PANEL_SRC" "$CLEANUP"
  PANEL="$CLEANUP"
elif [[ -n "$ROOT" && -f "$ROOT/install-panel.sh" ]]; then
  PANEL="$ROOT/install-panel.sh"
else
  CLEANUP="$(mktemp)"
  fetch_panel "${RAW_BASE}/install-panel.sh" "$CLEANUP"
  PANEL="$CLEANUP"
fi

if ! panel_is_current "$PANEL"; then
  echo "[guartrix] ERROR: install-panel.sh is older than 1.0.10 (wizard hangs after role choice)." >&2
  echo "[guartrix] GitHub raw CDN may still be stale. Retry with a commit pin:" >&2
  echo "  curl -fsSL 'https://raw.githubusercontent.com/${REPO_SLUG}/20c7759b84bf01dcdd376e30525a2b17af468165/scripts/install.sh' | sudo bash" >&2
  echo "Or download to a file first:" >&2
  echo "  curl -fsSL 'https://raw.githubusercontent.com/${REPO_SLUG}/main/scripts/install-panel.sh?t=$(date +%s)' -o /tmp/gp.sh && sudo bash /tmp/gp.sh" >&2
  [[ -n "$CLEANUP" ]] && rm -f "$CLEANUP"
  exit 1
fi

set +e
# Re-attach the controlling TTY so the panel wizard can prompt under curl|bash.
if [[ -r /dev/tty && -w /dev/tty ]]; then
  bash "$PANEL" "$@" </dev/tty >/dev/tty 2>/dev/tty
else
  bash "$PANEL" "$@"
fi
rc=$?
set -e
[[ -n "$CLEANUP" ]] && rm -f "$CLEANUP"
exit "$rc"
