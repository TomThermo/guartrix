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

- `apps/api/src/mail.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/invites.ts`
- `apps/api/src/routes/admin-settings.ts`

Without SMTP configured, outbound mail is written to `data/mail-outbox/`.

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
