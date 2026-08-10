# Notifications and alerts

Guartrix can notify operators and users through several channels, each backed by a different subsystem.

## Channels

### Email

Used for:

- verification mails
- password reset mails
- invite mails
- optional alert delivery
- test mail from Admin settings

Main anchors:

- `apps/api/src/infra/mail.ts`
- `apps/api/src/infra/mail-templates.ts`
- `apps/api/src/mail-templates/`
- `apps/api/src/routes/auth/`
- `apps/api/src/services/subusers.ts`
- `apps/api/src/routes/admin/settings.ts`

Without SMTP configured, outbound mail is written to `data/mail-outbox/`.

### Mail templates

All panel emails are rendered as **multipart/alternative** (HTML + plain text) from files under `apps/api/src/mail-templates/` via `renderMail()` in `apps/api/src/infra/mail-templates.ts`. Content is embedded into the API release bundle (`node scripts/generate-mail-templates.mjs` runs during `esbuild-release`). Operators can override subject/HTML/text and the shared layout under **Admin → Settings → Mail → Mail templates** (Monaco editor + Light/Dark preview); overrides live in `data/mail-templates.json` (gitignored). Upload or set the shared logo there (`appLogo` / `data/branding/`, served at `/api/public/branding/logo`); relative logo paths are absolutized against `publicBaseUrl` for mail clients. Shared branding also uses `appName`, `publicBaseUrl`, `mailFrom`. Template IDs: `verify-email`, `password-reset`, `invite-set-password`, `invite-server`, `alert`, `test-mail`.

### Activity webhook

`ACTIVITY_WEBHOOK_URL` sends Discord-compatible or generic webhook notifications for critical activity events and watchdog incidents.

Main anchors:

- `apps/api/src/notifications.ts`
- `apps/api/src/activity-log.ts`
- `scripts/monitor.sh`

### Per-server owner alerts & Discord status

**Server Properties → General** (owner / permitted users):

- Optional owner Discord webhook and/or email for crash, OOM, disk-high, offline, backup-failed
- **Discord status** — keeps one channel message updated (webhook only, no bot token) with online/offline and player count

This is separate from the global `ACTIVITY_WEBHOOK_URL` audit feed.

See [Panel guide](panel-guide.md#owner-alerts--discord-status).

### Web Push

Push subscriptions are stored and managed through `routes/account-push.ts` and `apps/api/src/web-push.ts`.

Web Push is account-level notification infrastructure, not a generic stream of all server events.

### In-panel alerts and banners

The web UI also surfaces:

- license warning banners
- restart-required banners after some admin setting changes
- validation and quota errors from API responses
- activity/history panels for audit visibility

## Critical event sources

Operational alerts can originate from:

- failed or repeated unhealthy restarts in `monitor.sh`
- node online/offline transitions
- unexpected server crashes/offline transitions
- license validation failures
- security-sensitive auth events

The shared action taxonomy lives in `packages/shared/src/activity.ts`.

## Muting and control

Admin settings expose alert-level controls, including muted action keys and delivery targets. Those values are stored in panel settings overrides rather than only in `.env`.

See [Panel settings](panel-settings.md).

## Related

- [Activity log](activity-log.md)
- [Accounts & quotas](accounts-and-quotas.md)
- [Operations](operations.md)
- [Security](security.md)
