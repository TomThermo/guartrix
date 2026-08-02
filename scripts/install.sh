#!/usr/bin/env bash
# Guartrix — one-line installer
#
#   curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
#
# curl|bash leaves stdin as a pipe, so prompts cannot work there. We download
# the real installer to disk and run it on a PTY wired to /dev/tty.
set -euo pipefail

URL="${GUARTRIX_INSTALL_PANEL_URL:-https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install-panel.sh}"
DEST="${GUARTRIX_INSTALL_DEST:-/tmp/guartrix-install.sh}"
SRC="${GUARTRIX_INSTALL_PANEL:-}"

# Local checkout / override
if [[ -n "$SRC" && -f "$SRC" ]]; then
  cp -f "$SRC" "$DEST"
elif [[ -n "${BASH_SOURCE[0]:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/install-panel.sh" ]]; then
  cp -f "$(dirname "${BASH_SOURCE[0]}")/install-panel.sh" "$DEST"
else
  echo "[guartrix] Downloading installer…"
  curl -fsSL -H 'Cache-Control: no-cache' "${URL}?t=$(date +%s)" -o "$DEST"
fi
chmod 700 "$DEST"

grep -q 'INSTALLER_VERSION=' "$DEST" || {
  echo "[guartrix] ERROR: bad download (${DEST})" >&2
  exit 1
}

echo "[guartrix] Starting $(grep -m1 'INSTALLER_VERSION=' "$DEST" | cut -d= -f2 | tr -d '"') …"

[[ -r /dev/tty && -w /dev/tty ]] || {
  echo "[guartrix] ERROR: need an interactive terminal (SSH)." >&2
  echo "  curl -fsSL '${URL}' -o ${DEST} && sudo bash ${DEST}" >&2
  exit 1
}

# PTY ↔ /dev/tty bridge (works under curl | sudo bash)
if command -v python3 >/dev/null 2>&1; then
  exec python3 - "$DEST" "$@" <<'PY'
import errno, os, pty, select, sys, termios, tty

installer, *args = sys.argv[1:]
pid, master = pty.fork()
if pid == 0:
    os.execvp("bash", ["bash", installer, *args])

tty_fd = os.open("/dev/tty", os.O_RDWR)
old = None
try:
    old = termios.tcgetattr(tty_fd)
    tty.setraw(tty_fd)
except termios.error:
    pass

def read(fd):
    try:
        return os.read(fd, 8192)
    except OSError as e:
        if e.errno == errno.EIO:
            return b""
        raise

try:
    while True:
        r, _, _ = select.select([master, tty_fd], [], [])
        if master in r:
            data = read(master)
            if not data:
                break
            os.write(tty_fd, data)
        if tty_fd in r:
            data = read(tty_fd)
            if not data:
                break
            os.write(master, data)
finally:
    if old is not None:
        try:
            termios.tcsetattr(tty_fd, termios.TCSADRAIN, old)
        except termios.error:
            pass
    for fd in (tty_fd, master):
        try:
            os.close(fd)
        except OSError:
            pass
    _, st = os.waitpid(pid, 0)
    sys.exit(os.WEXITSTATUS(st) if os.WIFEXITED(st) else 128 + os.WTERMSIG(st))
PY
fi

# Fallback without python3
if command -v script >/dev/null 2>&1; then
  cmd="bash $(printf '%q' "$DEST")"
  for a in "$@"; do cmd+=" $(printf '%q' "$a")"; done
  exec script -q -e -c "$cmd" /dev/null </dev/tty >/dev/tty 2>/dev/tty
fi

exec bash "$DEST" "$@" </dev/tty >/dev/tty 2>/dev/tty
