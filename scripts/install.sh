#!/usr/bin/env bash
# Guartrix one-shot installer (panel + local daemon + web).
# Does NOT install the license server — panels use https://license.guartrix.com.
#
#   curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash -s -- \
#     --domain your.domain.com \
#     --ip YOUR.PUBLIC.IP
#
# Alias for scripts/install-panel.sh (same flags and env vars).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$ROOT/install-panel.sh" "$@"
