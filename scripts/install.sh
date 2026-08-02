#!/usr/bin/env bash
# Guartrix installer entrypoint
#
# Recommended (same idea as Pterodactyl — download, then run):
#   curl -Lo /tmp/guartrix-install.sh https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install-panel.sh
#   sudo bash /tmp/guartrix-install.sh
#
# Also supported:
#   curl -Lo install.sh https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh
#   sudo bash install.sh
#
# Piped curl|bash is supported via a PTY bridge, but download-then-run is preferred.
set -euo pipefail

main() {
  local url dest tmp dir
  url="${GUARTRIX_INSTALL_PANEL_URL:-https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install-panel.sh}"

  for dir in /tmp /var/tmp "$HOME" /root; do
    [[ -n "$dir" && -d "$dir" && -w "$dir" ]] || continue
    dest="${dir}/guartrix-install.sh"
    break
  done
  dest="${GUARTRIX_INSTALL_DEST:-${dest:-/tmp/guartrix-install.sh}}"

  if [[ -n "${GUARTRIX_INSTALL_PANEL:-}" && -f "${GUARTRIX_INSTALL_PANEL}" ]]; then
    cp -f "${GUARTRIX_INSTALL_PANEL}" "$dest"
  elif [[ -n "${BASH_SOURCE[0]:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/install-panel.sh" ]]; then
    # This file is install.sh next to install-panel.sh — use sibling (or self if someone
    # curled install-panel as install.sh).
    if [[ "$(basename "${BASH_SOURCE[0]}")" == "install-panel.sh" ]]; then
      dest="$(realpath "${BASH_SOURCE[0]}")"
    else
      cp -f "$(dirname "${BASH_SOURCE[0]}")/install-panel.sh" "$dest"
    fi
  else
    echo "[guartrix] Downloading installer…"
    rm -f "$dest"
    tmp="$(mktemp "${dest}.XXXXXX")"
    if ! curl -fsSL --connect-timeout 20 --retry 5 --retry-delay 2 --retry-all-errors \
        "$url" -o "$tmp"; then
      rm -f "$tmp"
      tmp="$(mktemp "${dest}.XXXXXX")"
      wget -q -O "$tmp" "$url" || {
        echo "[guartrix] ERROR: could not download installer." >&2
        rm -f "$tmp"
        exit 1
      }
    fi
    grep -q 'INSTALLER_VERSION=' "$tmp" || {
      echo "[guartrix] ERROR: downloaded file is not the Guartrix installer." >&2
      rm -f "$tmp"
      exit 1
    }
    mv -f "$tmp" "$dest"
  fi

  chmod 700 "$dest"
  echo "[guartrix] Starting $(grep -m1 'INSTALLER_VERSION=' "$dest" | cut -d= -f2 | tr -d '"') …"

  # Already a normal interactive run (curl -Lo && bash) — just execute.
  if [[ -t 0 && -t 1 ]]; then
    exec bash "$dest" "$@"
  fi

  if [[ ! -r /dev/tty || ! -w /dev/tty ]]; then
    echo "[guartrix] ERROR: no terminal. Use the recommended two-step install:" >&2
    echo "  curl -Lo /tmp/guartrix-install.sh ${url}" >&2
    echo "  sudo bash /tmp/guartrix-install.sh" >&2
    exit 1
  fi

  # Piped curl|bash fallback — PTY on /dev/tty
  if command -v python3 >/dev/null 2>&1; then
    set +e
    python3 - "$dest" "$@" <<'PY'
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
def _read(fd):
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
            data = _read(master)
            if not data:
                break
            os.write(tty_fd, data)
        if tty_fd in r:
            data = _read(tty_fd)
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
    rc=$?
    set -e
    exit "$rc"
  fi

  exec bash "$dest" "$@" </dev/tty >/dev/tty 2>/dev/tty
}

main "$@"
