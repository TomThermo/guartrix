#!/usr/bin/env bash
# Ensure data/licenses/signing-public.pem exists (Ed25519 verify key — public, safe to ship).
# Sourced by install-panel / install-daemon / lib.sh. Does not exit the caller on failure.
#
# Usage:
#   # shellcheck source=./lib-license-public-key.sh
#   source ".../lib-license-public-key.sh"
#   guartrix_ensure_license_signing_public_pem "$ROOT" "$DATA_DIR"

guartrix_ensure_license_signing_public_pem() {
  local root="${1:-}"
  local data_dir="${2:-}"
  local dest src

  if [[ -z "$data_dir" ]]; then
    if [[ -n "$root" ]]; then
      data_dir="${root}/data"
    else
      data_dir="./data"
    fi
  fi
  dest="${data_dir%/}/licenses/signing-public.pem"

  if [[ -f "$dest" ]] && [[ -s "$dest" ]]; then
    return 0
  fi

  mkdir -p "$(dirname "$dest")" || return 1

  src=""
  if [[ -n "$root" && -f "${root}/packages/shared/license-signing-public.pem" ]]; then
    src="${root}/packages/shared/license-signing-public.pem"
  elif [[ -f "$(dirname "${BASH_SOURCE[0]}")/../packages/shared/license-signing-public.pem" ]]; then
    src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/packages/shared/license-signing-public.pem"
  fi

  if [[ -n "$src" && -f "$src" ]]; then
    cp "$src" "$dest" || return 1
  else
    # Same key as packages/shared (and baked into API/daemon) — official Guartrix verify key.
    cat > "$dest" <<'PEM' || return 1
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA9b4z3kFM5ojAUxz3jZk+f8vz6KKts96TXoX04SCx+BA=
-----END PUBLIC KEY-----
PEM
  fi
  chmod 644 "$dest" 2>/dev/null || true
  echo "[guartrix] Ensured license verify key → ${dest}"
  return 0
}
