# SLA ops (templates)

Operator runbooks for **managed SaaS / contractual SLA** posture. Numbers are
**templates** — fill RTO/RPO and contacts for your install. Attest drills in
**Admin → Settings → Go-live**.

External pentest and legal SLA text are **process**, not auto-greened by the panel.
Engineering controls: `REQUIRE_REDIS_HA` / `PANEL_HA`, BullMQ, peer-only transfers,
owner rate limits — see [env-reference](env-reference.md).

## Targets (fill in)

| Metric | Template | Your value |
|--------|----------|------------|
| Panel API uptime | 99.9% monthly | |
| RTO (panel restore) | 1 hour | |
| RPO (MySQL backup) | 24 hours | |
| On-call | Primary + secondary | |

## Monitoring / alerts

1. Scrape `GET /api/metrics` (protect with `METRICS_TOKEN` when exposed).
2. Alert when `GET /api/ready` is not 200 for >2 minutes.
3. Alert on Redis down (Go-live redis check / Redis ping latency).
4. Alert on BullMQ `failed` counters rising (`GET /api/admin/jobs`).
5. Keep `ACTIVITY_WEBHOOK_URL` and/or `ALERT_EMAIL` set (required when `REQUIRE_REDIS_HA=1`).
6. Watchdog: `build/start.sh` monitor log under `data/logs/guartrix-monitor.log`.

## Incident

1. Check **Admin → Status** (`/statusline`) and `GET /api/ready`.
2. If Redis HA: confirm Redis ping under Settings → Security / Go-live.
3. Watchdog / `ACTIVITY_WEBHOOK_URL` — confirm restart alerts.
4. Daemon nodes: firewall to panel IP only; game/SFTP ports public.
5. Record timeline in Activity log + external ticket system.
6. After recovery: rotate secrets if compromise suspected ([security.md](security.md) + `scripts/sla-secret-rotation-drill.sh`).

## Backup / restore drill

```bash
bash scripts/sla-restore-drill.sh
# optional staging restore:
# STAGING_DATABASE_URL='mysql://…' bash scripts/sla-restore-drill.sh --restore-latest
```

1. Run panel DB backup (`scripts/install-panel-backup-cron.sh` / nightly job).
2. Restore to a **staging** MySQL (not production) and boot API with that URL.
3. Confirm login + one server list.
4. Record date under **Go-live → Last panel DB restore drill**.

## Secret rotation drill

```bash
bash scripts/sla-secret-rotation-drill.sh
```

Record date under **Go-live → Last secret rotation drill**.

## Capacity review

1. Node count, server count, MySQL size, Redis memory.
2. Scale smoke: `bash scripts/scale-smoke.sh` when changing hardware.
3. See [scaling.md](scaling.md) and [scale roadmap](../scale-100n-1000c-roadmap.md).
4. Record date under **Go-live → Last capacity review**.

## HA posture

For managed multi-API:

```bash
REQUIRE_REDIS_HA=1   # or PANEL_HA=1
SESSION_STORE=redis
RATE_LIMIT_STORE=redis
REDIS_URL=redis://…
JOBS_BULLMQ=1
TRANSFER_ALLOW_PANEL_STAGING=0
```

Boot refuses to start if Redis/BullMQ/store modes are wrong. Go-live marks missing attestations as **warn** under HA.

## Pentest

Full brief: [pentest-scope.md](pentest-scope.md).

Do **not** remove the README AI disclaimer until an external assessment is complete and remediations are shipped.

## Related

- [Security checklist](security.md)
- [Panel settings](panel-settings.md)
- [Operations](operations.md)
- [API conventions](api-conventions.md) (`/api/v1`, error codes)
- Admin → Settings → **Go-live**
