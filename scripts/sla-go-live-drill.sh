#!/usr/bin/env bash
# Run all SLA drills on live and attest Go-live dates (operator).
# Does not rotate secrets or run external pentest.
# Usage:
#   bash scripts/sla-go-live-drill.sh --live --attest-all
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LIVE=0
ATTEST_ALL=0
for arg in "$@"; do
  case "$arg" in
    --live) LIVE=1 ;;
    --attest-all) ATTEST_ALL=1; LIVE=1 ;;
    -h|--help)
      sed -n '2,6p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "[sla-go-live] Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

if [[ "$LIVE" -eq 0 ]]; then
  echo "[sla-go-live] Use --live --attest-all on the operator host." >&2
  exit 1
fi

FAIL=0

echo "[sla-go-live] 1/4 Panel DB backup + restore drill attestation"
if bash "$ROOT/scripts/sla-restore-drill.sh" --backup-only ${ATTEST_ALL:+--attest}; then
  :
else
  FAIL=1
fi

echo
echo "[sla-go-live] 2/4 Secret rotation smoke"
if bash "$ROOT/scripts/sla-secret-rotation-drill.sh" --smoke-only; then
  if [[ "$ATTEST_ALL" -eq 1 ]]; then
    ROOT="$ROOT" DATA_DIR="$ROOT/data" node "$ROOT/scripts/lib/panel-settings-attest.mjs" slaSecretRotationAt
  fi
else
  FAIL=1
fi

echo
echo "[sla-go-live] 3/4 Capacity review"
if bash "$ROOT/scripts/sla-capacity-review-drill.sh" ${ATTEST_ALL:+--attest}; then
  :
else
  FAIL=1
fi

echo
echo "[sla-go-live] 4/4 Runbook + pentest ack (Go-live booleans)"
if [[ "$ATTEST_ALL" -eq 1 ]]; then
  ROOT="$ROOT" DATA_DIR="$ROOT/data" node "$ROOT/scripts/lib/panel-settings-attest.mjs" slaIncidentRunbookAck true
  ROOT="$ROOT" DATA_DIR="$ROOT/data" node "$ROOT/scripts/lib/panel-settings-attest.mjs" slaPentestAck true
  echo "[sla-go-live] slaPentestAck=true means scheduled or done — external report is still operator process."
fi

echo
if [[ "$FAIL" -ne 0 ]]; then
  echo "[sla-go-live] Finished with failures — fix smoke/backup before treating E7 complete." >&2
  exit 1
fi

echo "[sla-go-live] All drills OK. Verify Admin → Settings → Go-live readiness table."
