#!/usr/bin/env bash
# Guartrix one-shot installer entrypoint.
#
# Interactive (recommended — no flags):
#   curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
#
# When piped via curl, this downloads install-panel.sh from the same branch and
# re-runs it with /dev/tty attached (required for prompts under curl|bash).
# Local checkouts use the sibling scripts/install-panel.sh.
#
# Optional flags / env: see install-panel.sh --help
# Non-interactive automation: GUARTRIX_NONINTERACTIVE=1 plus flags/env.
set -euo pipefail

RAW_BASE="${GUARTRIX_INSTALL_RAW_BASE:-https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts}"
# Optional override: path or URL to install-panel.sh (skip GitHub)
PANEL_SRC="${GUARTRIX_INSTALL_PANEL:-}"

ROOT=""
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || ROOT=""
fi

PANEL=""
CLEANUP=""
if [[ -n "$PANEL_SRC" && -f "$PANEL_SRC" ]]; then
  PANEL="$PANEL_SRC"
elif [[ -n "$PANEL_SRC" && "$PANEL_SRC" == https://* ]]; then
  CLEANUP="$(mktemp)"
  echo "[guartrix] Fetching installer from ${PANEL_SRC} …"
  curl -fsSL "$PANEL_SRC" -o "$CLEANUP"
  PANEL="$CLEANUP"
elif [[ -n "$ROOT" && -f "$ROOT/install-panel.sh" ]]; then
  PANEL="$ROOT/install-panel.sh"
else
  CLEANUP="$(mktemp)"
  echo "[guartrix] Fetching installer from ${RAW_BASE}/install-panel.sh …"
  curl -fsSL "${RAW_BASE}/install-panel.sh" -o "$CLEANUP"
  PANEL="$CLEANUP"
fi

# Prove the downloaded/local script is new enough (wizard tty fix).
if ! grep -q 'INSTALLER_VERSION="1\.0\.10"' "$PANEL" 2>/dev/null && ! grep -q 'tty_out_nl' "$PANEL" 2>/dev/null; then
  echo "[guartrix] WARNING: install-panel.sh looks older than 1.0.10 (wizard may hang after role choice)." >&2
  echo "[guartrix] If you just pushed, wait ~60s for GitHub raw CDN, or set GUARTRIX_INSTALL_PANEL to a local file." >&2
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
