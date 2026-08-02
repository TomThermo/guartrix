#!/usr/bin/env bash
# Guartrix one-shot installer entrypoint.
#
# Interactive (recommended — no flags):
#   curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
#
# When piped via curl, this downloads install-panel.sh from the same branch.
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

set +e
bash "$PANEL" "$@"
rc=$?
set -e
[[ -n "$CLEANUP" ]] && rm -f "$CLEANUP"
exit "$rc"
