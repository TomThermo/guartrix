#!/usr/bin/env bash
# Guartrix one-shot installer (panel + local daemon + web).
# Does NOT install the license server — panels use https://license.guartrix.com.
#
#   # HTTP via public IP (no TLS):
#   curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash -s -- \
#     --http --ip YOUR.PUBLIC.IP
#
#   # HTTPS with domain:
#   curl -fsSL … | sudo bash -s -- --https --domain your.domain.com --ip YOUR.PUBLIC.IP
#
#   # External panel MySQL:
#   curl -fsSL … | sudo bash -s -- --mysql-external --mysql-host 10.0.0.5 \
#     --mysql-user guartrix --mysql-password '…' --mysql-database guartrix_panel
#
# Alias for scripts/install-panel.sh (same flags and env vars).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$ROOT/install-panel.sh" "$@"
