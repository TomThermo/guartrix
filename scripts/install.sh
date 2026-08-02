#!/usr/bin/env bash
# Guartrix install entrypoint (curl|bash safe).
#
# Known-good pattern (what users already use successfully):
#   curl …/install-panel.sh -o /tmp/gp.sh && sudo bash /tmp/gp.sh
#
# This wrapper does the same automatically so this works too:
#   curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
#
# Why: under `curl | sudo bash`, stdin is the script pipe — not a TTY. Interactive
# prompts then hang or stay invisible. Running a on-disk script with stdin bound
# to /dev/tty matches the working /tmp/gp.sh flow.
set -euo pipefail

REPO_SLUG="${GUARTRIX_INSTALL_REPO:-TomThermo/guartrix}"
INSTALL_REF="${GUARTRIX_INSTALL_REF:-main}"
PANEL_URL="${GUARTRIX_INSTALL_PANEL_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${INSTALL_REF}/scripts/install-panel.sh}"
# Optional: local path instead of download (dev checkouts)
PANEL_SRC="${GUARTRIX_INSTALL_PANEL:-}"

ROOT=""
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || ROOT=""
fi

TMP="$(mktemp -t guartrix-install.XXXXXX)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

if [[ -n "$PANEL_SRC" && -f "$PANEL_SRC" ]]; then
  cp -f "$PANEL_SRC" "$TMP"
  echo "[guartrix] Using local installer ${PANEL_SRC}"
elif [[ -n "$ROOT" && -f "$ROOT/install-panel.sh" ]]; then
  cp -f "$ROOT/install-panel.sh" "$TMP"
  echo "[guartrix] Using local installer ${ROOT}/install-panel.sh"
else
  bust="$(date +%s)"
  echo "[guartrix] Downloading installer…"
  curl -fsSL \
    -H 'Cache-Control: no-cache' \
    -H 'Pragma: no-cache' \
    "${PANEL_URL}?t=${bust}" \
    -o "$TMP"
fi

chmod 700 "$TMP"

if ! grep -q 'tty_out_nl' "$TMP" 2>/dev/null; then
  echo "[guartrix] ERROR: downloaded installer looks too old (missing tty fixes)." >&2
  echo "[guartrix] Wait ~5m for GitHub raw CDN, or run:" >&2
  echo "  curl -fsSL '${PANEL_URL}?t=$(date +%s)' -o /tmp/gp.sh && sudo bash /tmp/gp.sh" >&2
  exit 1
fi

# Match the working command: bash /path/to/file with a real TTY on stdin.
# Only redirect stdin — leave stdout/stderr as the user's terminal (redirecting
# all three to /dev/tty has caused hangs under some sudo/SSH setups).
set +e
if [[ -r /dev/tty ]]; then
  bash "$TMP" "$@" </dev/tty
else
  echo "[guartrix] ERROR: no /dev/tty — cannot run interactive installer from a pipe." >&2
  echo "[guartrix] Use: curl -fsSL '…/install-panel.sh' -o /tmp/gp.sh && sudo bash /tmp/gp.sh" >&2
  exit 1
fi
rc=$?
set -e
exit "$rc"
