#!/usr/bin/env bash
# Guartrix production start:
# 1) stop old daemon / API / web / watchdog processes
# 2) preflight checks
# 3) start daemon → API → web (client), verify health
# 4) start the watchdog (scripts/monitor.sh) so the stack self-heals
set -euo pipefail

# shellcheck source=./lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

stop_old
preflight
start_services
ensure_monitor
summary
