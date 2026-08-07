#!/usr/bin/env bash
# Secret rotation drill checklist (operator). Does not rotate live secrets automatically.
# See docs/wiki/security.md and docs/wiki/sla-ops.md.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cat <<'EOF'
[sla-secret-rotation] Drill checklist (staging first):

  [ ] SESSION_SECRET — generate new value; restart all API replicas together
  [ ] Daemon node tokens — rotate via Admin → Nodes (or reinstall remote)
  [ ] SMTP / Discord webhook / Mollie keys — rotate at provider, update Admin Settings / .env
  [ ] Cloudflare API token — rotate + update Admin → Settings
  [ ] Application API keys (gta_) / Client API keys (gt_) — revoke unused; mint replacements
  [ ] License signing public key shipping unchanged; private PEM never in this repo
  [ ] Confirm login + one daemon /health after restart
  [ ] Record date in Admin → Settings → Go-live → secret rotation

Never commit .env, data/daemon.env, or PEM private keys.
EOF
