# Activity log

Audit trail of who did what: power actions, settings, files, backups, ports,
subusers, players, logins and admin changes. Every event stores the actor, the
IP, the target server, whether it succeeded, and a small metadata blob.

Not to be confused with the **Log Files** tab, which shows the Minecraft
`logs/*.log` files produced by the server itself.

## Where to find it

| View | Path | Access |
|------|------|--------|
| Per server | Server → **Activity Log** tab | Owner, admin, or subuser with `activity.read` (`audit.read` also accepted) |
| Global | Navbar → **Activity** (`/admin/activity`) | Admins only |

Both views page through history and filter by category, exact action, or free
text (matches actor, server name, action key, IP and metadata). A **CSV** button
exports the currently filtered set.

## Categories

`power`, `console`, `settings`, `file`, `backup`, `database`, `allocation`,
`schedule`, `subuser`, `player`, `addon`, `server`, `auth`, `admin`, `node`.

Action keys are stable strings like `server.start`, `file.delete` or
`user.role-change` — the full registry with labels lives in
[`packages/shared/src/activity.ts`](../../packages/shared/src/activity.ts).

## Who shows up as actor

| Actor | Meaning |
|-------|---------|
| Username | A signed-in panel user (with their request IP) |
| `scheduler` | Scheduled tasks and backup schedules |
| `system` | Daemon-driven events: crashes, unexpected offline, node up/down |

Crashes and unexpected stops are detected from process-manager status changes,
so a `RUNNING → ERROR` transition becomes `server.crashed` and a stop nobody
asked for becomes `server.offline`.

## Retention

Events are kept for `ACTIVITY_LOG_RETENTION_DAYS` days (default **90**) and
pruned hourly by the API. Set `0` to keep everything. The current window is
shown under the table.

## Alerts (Discord / email)

Critical events can be pushed out of the panel — crashes, **OOM kills**
(`server.oom`), **disk high** (`server.disk_high`), unexpected offline,
node offline, node token rotation, failed backups, backup restores, owner
changes, user deletes, role changes, password resets and failed sign-ins.

Besides the global `ACTIVITY_WEBHOOK_URL` / `ALERT_EMAIL`, each server can set an
**owner webhook / email** (Server Properties → General) that also receives that
server's critical alerts. The separate **Discord status** feature (same page)
keeps one channel message updated with online/offline + player count and is not
part of the alert pipeline.

```bash
# .env
ACTIVITY_WEBHOOK_URL=https://discord.com/api/webhooks/...
ALERT_EMAIL=ops@guartrix.com          # needs SMTP_* (else data/mail-outbox/)
ACTIVITY_ALERT_MUTE=auth.login-failed # comma-separated action keys to skip
```

Discord URLs get a rich embed; any other URL receives a generic JSON POST:

```json
{
  "source": "guartrix",
  "event": { "action": "server.crashed", "serverName": "survival", "actorName": "system", "...": "" },
  "message": "Server crashed — survival\nServer: survival (abc123)\n..."
}
```

The same action on the same target only alerts once per 5 minutes, so a crash
loop doesn't flood the channel. Webhook and mail failures are logged and never
block the action that triggered them.

## API

```http
GET /api/servers/:id/activity?offset=0&limit=25&category=power&action=server.stop&q=alice
GET /api/admin/activity?serverId=...&userId=...
```

Both return `{ events, total, offset, limit, retentionDays }`. `limit` is capped
at 100. Metadata keys that look like secrets (`pass`, `secret`, `token`,
`credential`, `authorization`, `cookie`, `hash`) are dropped before storage.
