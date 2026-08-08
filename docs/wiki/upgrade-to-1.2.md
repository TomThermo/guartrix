# Upgrade to Guartrix 1.2.x

From **1.1.x → 1.2.x** on an existing panel checkout (operator or customer install).

## What 1.2 means

SaaS / SLA **engineering** track on top of the 1.1 scale path:

- Admin → Settings → **Go-live** readiness + SLA attestations (1.1.2+)
- BullMQ durable jobs when Redis is configured; disk-watch via queues
- Stable **`/api/v1`** dual-mount (Fastify `rewriteUrl`)
- Peer-only node transfer by default (`TRANSFER_ALLOW_PANEL_STAGING=0`)
- `REQUIRE_REDIS_HA` / `PANEL_HA` for managed multi-API boot gates
- Owner aggregate rate limit (`API_OWNER_RATE_LIMIT`)
- Ops scripts: `sla-restore-drill.sh`, `sla-secret-rotation-drill.sh`, thicker `scale-smoke.sh`

External pentest execution and counsel-signed SLAs remain **process** — see [sla-ops.md](sla-ops.md) and [pentest-scope.md](pentest-scope.md).

## Steps

1. **Backup** the panel DB and `data/` (tokens, sessions, license, `panel-settings.json`).

2. **Pull / unpack** 1.2.x.

3. **Env** — merge new knobs from [`.env.example`](../../.env.example):

| Key | Notes |
|-----|--------|
| `JOBS_BULLMQ` / `JOBS_EMBEDDED` | Default on when `REDIS_URL` is set |
| `REQUIRE_REDIS_HA` / `PANEL_HA` | `1` on multi-API / contractual SLA estates |
| `TRANSFER_ALLOW_PANEL_STAGING` | Default `0` (peer-only); set `1` only if peers cannot reach each other |
| `API_OWNER_RATE_LIMIT` | Default `1800`/min per owning user across session + Client API keys |
| `METRICS_TOKEN` | Protect `/api/metrics` with Bearer when scraped publicly |
| `ALERT_EMAIL` / `ACTIVITY_WEBHOOK_URL` | Required for healthy Go-live under `REQUIRE_REDIS_HA=1` |

4. **Migrate** (if any pending Prisma migrations):

```bash
npm run db:generate
bash scripts/db-migrate.sh
```

5. **Rebuild and restart** (operator checkout):

```bash
bash scripts/build-out.sh
# restore operator-only scripts into build/scripts/ if needed
bash build/start.sh
```

6. **Smoke:**

```bash
bash scripts/scale-smoke.sh
curl -sf http://127.0.0.1:3001/api/v1/health
curl -sf http://127.0.0.1:3001/api/ready
```

7. Open **Admin → Settings → Go-live**, fix fails, run restore/secret drills, attest dates.

## Breaking / behaviour notes

- Panel tmpdisk transfer fallback is **off** unless you opt in — peer connectivity between nodes is required for transfers with MySQL/worlds.
- With `REQUIRE_REDIS_HA=1`, the API **refuses to start** without Redis + BullMQ + `SESSION_STORE=redis` + `RATE_LIMIT_STORE=redis`.
- Prefer `/api/v1/…` for new integrators; `/api/…` remains during the v1 window.

## Related

- [Upgrade to 1.1](upgrade-to-1.1.md) (if still on 1.0.x, do that first)
- [SLA ops](sla-ops.md) · [Scaling](scaling.md) · [Env reference](env-reference.md)
- [Improvement map](../roadmap.md)
