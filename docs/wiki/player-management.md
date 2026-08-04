# Player management

Player-facing admin features are spread across the dashboard, server header chips, and several server tabs.

## Included surfaces

This area includes:

- whitelist state and entries
- online players list
- kick/ban/pardon and related moderation actions
- recent player history
- player count chips on dashboard and server header

Main route anchors:

- `apps/api/src/routes/servers-players.ts`
- `apps/api/src/routes/player-actions.ts`
- `apps/api/src/servers/online-players.ts`
- `apps/api/src/servers/moderation.ts`
- `packages/node-agent/src/player-history.ts`

## Online players

The panel can show current players and recent join/leave information. This data is derived from daemon-side observation and cached/forwarded through the panel.

Important behavior:

- player presence is not necessarily a Mojang-authoritative source
- some states come from console/event parsing rather than direct ping
- the dashboard can show aggregate or per-server counts

The live player stream can also be exposed through WebSocket fan-out for the browser UI.

## Whitelist

Whitelist controls exist as:

- a quick toggle modal from the dashboard or header chip
- a dedicated whitelist management panel on the server page

Expected actions include:

- enable or disable whitelist
- add/remove players
- inspect current list state

Permissions are governed separately from console/files. Owners, admins, or subusers need the relevant server access.

## Moderation

Player actions include:

- kick
- ban
- unban / pardon
- whitelist add/remove
- possibly operator-defined convenience actions based on the server type or panel UI

Moderation history is a persisted product surface, not just a transient console action. See `PlayerModerationEvent` in Prisma.

## Data sources and limits

Operators should understand the distinction between:

- live presence
- moderation history
- whitelist configuration
- server logs

These are related but not identical:

- live presence is derived from current daemon observation
- moderation history is a DB-backed event record
- whitelist is gameplay configuration on the server
- logs remain the low-level source of truth when diagnosing odd states

## Related

- [Server management](server-management.md)
- [Activity log](activity-log.md)
- [Client API](client-api.md)
