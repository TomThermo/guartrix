# SLA ops (templates)

Operator runbooks for **managed SaaS / contractual SLA** posture. Numbers are
**templates** — fill RTO/RPO and contacts for your install. Attest drills in
**Admin → Settings → Go-live**.

External pentest and legal SLA text are **process**, not auto-greened by the panel.

## Targets (fill in)

| Metric | Template | Your value |
|--------|----------|------------|
| Panel API uptime | 99.9% monthly | |
| RTO (panel restore) | 1 hour | |
| RPO (MySQL backup) | 24 hours | |
| On-call | Primary + secondary | |

## Incident

1. Check **Admin → Status** (`/statusline`) and `GET /api/ready`.
2. If Redis HA: confirm Redis ping under Settings → Security / Go-live.
3. Watchdog / `ACTIVITY_WEBHOOK_URL` — confirm restart alerts.
4. Daemon nodes: firewall to panel IP only; game/SFTP ports public.
5. Record timeline in Activity log + external ticket system.
6. After recovery: rotate secrets if compromise suspected ([security.md](security.md) rotation runbook).

## Backup / restore drill

1. Run panel DB backup (`scripts/install-panel-backup-cron.sh` / nightly job).
2. Restore to a **staging** MySQL (not production) and boot API with that URL.
3. Confirm login + one server list.
4. Record date under **Go-live → Last panel DB restore drill**.

## Capacity review

1. Node count, server count, MySQL size, Redis memory.
2. Scale smoke: `bash scripts/scale-smoke.sh` when changing hardware.
3. See [scaling.md](scaling.md) and [scale roadmap](../scale-100n-1000c-roadmap.md).
4. Record date under **Go-live → Last capacity review**.

## Pentest scope (brief)

Focus areas for an independent assessor:

- Auth / CSRF / invite + registration (emailVerified gates)
- File manager + SFTP jail + archive extract
- Daemon JWT + container isolation
- SSRF / outbound download allowlists
- Application API scopes

Do **not** remove the README AI disclaimer until an external assessment is complete and remediations are shipped.

## Related

- [Security checklist](security.md)
- [Panel settings](panel-settings.md)
- [Operations](operations.md)
- Admin → Settings → **Go-live**
