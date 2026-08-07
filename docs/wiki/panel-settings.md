# Panel settings (Admin UI)

Admins configure panel-wide options under **Admin → Settings** (General, Mail, Security, Alerts, **Go-live**), similar to Pterodactyl’s admin settings.

## What it stores

Overrides live in **`data/panel-settings.json`** (mode `0600`). Values merge on top of `.env` at API boot and when you save.

| Tab | Examples |
|-----|----------|
| General | Public host / base URL, registration, default quotas, Cloudflare DNS |
| Mail | `MAIL_FROM`, SMTP host/port/TLS/user/password, **Send test mail** |
| Security | `HTTPS_ENABLED`, `SESSION_SECURE`, roles that must use 2FA; **Redis** status (read-only) + test connection |
| Alerts | Activity webhook, alert email, muted action keys |
| Go-live | Live readiness checks (`GET /api/admin/readiness`), job queue status, SLA operator attestations |

Secrets (SMTP password, Cloudflare token) are never returned in full — leave the field blank to keep the current value.

### Go-live tab

Shows pass/warn/fail for SMTP, registration, HTTPS, TRUST_PROXY, admin 2FA, Redis, alerts, daemon JWT legacy, scheduler locks, transfer staging policy, and BullMQ vs in-process jobs. Deep-links jump to the matching settings tab. Under `REQUIRE_REDIS_HA=1`, missing Redis/BullMQ/alerts/attestations are treated more strictly.

SLA checkboxes/dates (restore drill, capacity review, secret rotation, incident runbook ack, pentest ack) are **operator attestations** stored in `panel-settings.json` — see [SLA ops](sla-ops.md) · [Upgrade to 1.2](upgrade-to-1.2.md).

## Restart required

Changing **public host**, **public base URL**, **HTTPS**, or **session secure** also patches the live **`.env`** so prod-web can pick them up. After those saves the UI shows a restart banner — run:

```bash
bash build/start.sh
```

Other keys (registration, mail, quotas, 2FA roles, alerts, Cloudflare, SLA attestations) apply to the API **immediately** without restart.

## Relation to `.env`

- Fresh installs still use [`.env.example`](../../.env.example) / [env-reference](env-reference.md).
- The Settings UI is the preferred way to change the knobs above on a running panel.
- Do not commit `data/panel-settings.json` (under `data/`, gitignored with other operator state).

Go-live checklist (webhook, SMTP, Mollie, backups, HA): for **customer installs** after download — use **Admin → Settings → Go-live** and [Improvement map — Sprint 10/11](../roadmap.md).

## Nodes

**Admin → Nodes** (`/admin/system`) remains node/daemon management — not panel env settings.
