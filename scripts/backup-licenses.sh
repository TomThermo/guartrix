#!/usr/bin/env bash
# Backup license store + Ed25519 signing keys → data/backups/licenses/
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=./lib.sh
source "$ROOT/scripts/lib.sh"

SRC="$ROOT/data/licenses"
OUT_DIR="$ROOT/data/backups/licenses"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

if [[ ! -d "$SRC" ]]; then
  fail "Missing $SRC"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/licenses_${STAMP}.tar.gz"

info "Backing up ${SRC} → ${OUT}"
# Store only (licenses.json, channel.json, signing-*.pem). Mode preserved.
tar -C "$ROOT/data" -czf "$OUT" licenses
chmod 600 "$OUT"
info "License backup OK ($(du -h "$OUT" | awk '{print $1}'))"

# Keep last 30 archives
ls -1t "$OUT_DIR"/licenses_*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
