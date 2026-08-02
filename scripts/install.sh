#!/usr/bin/env bash
# Guartrix install entrypoint for:  curl …/install.sh | sudo bash
#
# Under curl|bash, stdin is a pipe — interactive prompts break. This wrapper
# downloads install-panel.sh to disk and re-runs it inside `script(1)` so the
# installer gets a real PTY (same effective setup as:
#   curl …/install-panel.sh -o /tmp/gp.sh && sudo bash /tmp/gp.sh
# ).
set -euo pipefail

REPO_SLUG="${GUARTRIX_INSTALL_REPO:-TomThermo/guartrix}"
INSTALL_REF="${GUARTRIX_INSTALL_REF:-main}"
PANEL_URL="${GUARTRIX_INSTALL_PANEL_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${INSTALL_REF}/scripts/install-panel.sh}"
PANEL_SRC="${GUARTRIX_INSTALL_PANEL:-}"
DEST="${GUARTRIX_INSTALL_DEST:-/tmp/guartrix-install.sh}"

ROOT=""
if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || ROOT=""
fi

if [[ -n "$PANEL_SRC" && -f "$PANEL_SRC" ]]; then
  cp -f "$PANEL_SRC" "$DEST"
  echo "[guartrix] Using local installer ${PANEL_SRC}"
elif [[ -n "$ROOT" && -f "$ROOT/install-panel.sh" ]]; then
  cp -f "$ROOT/install-panel.sh" "$DEST"
  echo "[guartrix] Using local installer ${ROOT}/install-panel.sh"
else
  echo "[guartrix] Downloading installer…"
  curl -fsSL \
    -H 'Cache-Control: no-cache' \
    -H 'Pragma: no-cache' \
    "${PANEL_URL}?t=$(date +%s)" \
    -o "$DEST"
fi

chmod 700 "$DEST"

if ! grep -q 'INSTALLER_VERSION=' "$DEST" 2>/dev/null; then
  echo "[guartrix] ERROR: download does not look like the Guartrix installer." >&2
  exit 1
fi

VER="$(sed -n 's/^INSTALLER_VERSION="\([^"]*\)".*/\1/p' "$DEST" | head -1)"
echo "[guartrix] Starting installer v${VER:-?} from ${DEST}"

# Build a safely quoted command line for script -c
cmd="bash $(printf '%q' "$DEST")"
for a in "$@"; do
  cmd+=" $(printf '%q' "$a")"
done

# Preferred: allocate a PTY so read/echo behave like a normal interactive shell.
if command -v script >/dev/null 2>&1 && [[ -r /dev/tty ]]; then
  # util-linux script: -e return child status, -q quiet header, -c run command
  exec script -q -e -c "$cmd" /dev/null </dev/tty >/dev/tty 2>/dev/tty
fi

# Fallback without script(1)
if [[ -r /dev/tty ]]; then
  exec bash "$DEST" "$@" </dev/tty >/dev/tty 2>/dev/tty
fi

echo "[guartrix] ERROR: no usable TTY. Run instead:" >&2
echo "  curl -fsSL '${PANEL_URL}' -o /tmp/guartrix-install.sh && sudo bash /tmp/guartrix-install.sh" >&2
exit 1
