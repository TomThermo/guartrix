# Panel settings (Admin UI)

Admins configure panel-wide options under **Admin → Settings** (General, Mail, Security, Alerts), similar to Pterodactyl’s admin settings.

## What it stores

Overrides live in **`data/panel-settings.json`** (mode `0600`). Values merge on top of `.env` at API boot and when you save.

| Tab | Examples |
|-----|----------|
| General | Public host / base URL, registration, default quotas, Cloudflare DNS |
| Mail | `MAIL_FROM`, SMTP host/port/TLS/user/password, **Send test mail** |
| Security | `HTTPS_ENABLED`, `SESSION_SECURE`, roles that must use 2FA; **Redis** status (read-only) + test connection |
| Alerts | Activity webhook, alert email, muted action keys |

Secrets (SMTP password, Cloudflare token) are never returned in full — leave the field blank to keep the current value.

## Restart required

Changing **public host**, **public base URL**, **HTTPS**, or **session secure** also patches the live **`.env`** so prod-web can pick them up. After those saves the UI shows a restart banner — run:

```bash
bash build/start.sh
```

Other keys (registration, mail, quotas, 2FA roles, alerts, Cloudflare) apply to the API **immediately** without restart.

## Relation to `.env`

- Fresh installs still use [`.env.example`](../../.env.example) / [env-reference](env-reference.md).
- The Settings UI is the preferred way to change the knobs above on a running panel.
- Do not commit `data/panel-settings.json` (under `data/`, gitignored with other operator state).

Go-live checklist (webhook, SMTP, Mollie, backups): for **customer installs** after download — [Improvement map — customer install](../roadmap.md#customer-install-their-vps--documented-not-this-host).

## Nodes

**Admin → Nodes** (`/admin/system`) remains node/daemon management — not panel env settings.
