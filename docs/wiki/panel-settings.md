# Panel settings (Admin UI)

Admins configure panel-wide options under **Admin → Settings** (top tabs: General, Mail, Backup, Security, Misc, Alerts, **Go-live**), similar to Pelican / Pterodactyl admin settings.

## What it stores

Overrides live in **`data/panel-settings.json`** (mode `0600`). Values merge on top of `.env` at API boot and when you save.

| Tab | Examples |
|-----|----------|
| General | App name / logo / favicon, public host / base URL, registration, default quotas, Cloudflare DNS |
| Mail | `MAIL_FROM`, SMTP host/port/TLS/user/password, **Send test mail** |
| Backup | Default backup retention, offsite hook command |
| Security | `HTTPS_ENABLED`, `SESSION_SECURE`, `TRUST_PROXY` / trusted proxies (+ Cloudflare IP preset), 2FA roles, **Cloudflare Turnstile** (login/register); **Redis** status + test |
| Misc | Debug banner, unit prefix (MB vs MiB), navigation preference, display width |
| Alerts | Activity webhook, alert email, muted action keys |
| Go-live | Live readiness checks (`GET /api/admin/readiness`), job queue status, SLA operator attestations |

Public branding is also exposed at **`GET /api/public/branding`** for the web shell (no auth).

Secrets (SMTP password, Cloudflare DNS token, Turnstile secret) are never returned in full — leave the field blank to keep the current value.

### Go-live tab

Shows pass/warn/fail for SMTP, registration, HTTPS, TRUST_PROXY, admin 2FA, Redis, alerts, daemon JWT legacy, scheduler locks, transfer staging policy, and BullMQ vs in-process jobs. Deep-links jump to the matching settings tab. Under `REQUIRE_REDIS_HA=1`, missing Redis/BullMQ/alerts/attestations are treated more strictly.

SLA checkboxes/dates (restore drill, capacity review, secret rotation, incident runbook ack, pentest ack) are **operator attestations** stored in `panel-settings.json` — see [SLA ops](sla-ops.md) · [Upgrade to 1.2](upgrade-to-1.2.md).

## Restart required

Changing **public host**, **public base URL**, **HTTPS**, or **session secure** also patches the live **`.env`** so prod-web can pick them up. After those saves the UI shows a restart banner — run:

```bash
bash build/start.sh
```

Other keys (registration, mail, quotas, default backup retention, 2FA roles, Turnstile, alerts, Cloudflare DNS, SLA attestations) apply to the API **immediately** without restart.

## Relation to `.env`

- Fresh installs still use [`.env.example`](../../.env.example) / [env-reference](env-reference.md).
- The Settings UI is the preferred way to change the knobs above on a running panel.
- Do not commit `data/panel-settings.json` (under `data/`, gitignored with other operator state).

Go-live checklist (webhook, SMTP, Mollie, backups, HA): for **customer installs** after download — use **Admin → Settings → Go-live** and [Improvement map — Sprint 10/11](../roadmap.md).

## Nodes

**Admin → Nodes** (`/admin/system`) remains node/daemon management — not panel env settings.

**Admin → Servers** (`/admin/servers`) is the fleet server editor (resources, suspend, backup retention) — not under Settings tabs.
