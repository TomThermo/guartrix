# Client API (personal API keys)

Automate Guartrix with a personal **API key** instead of a browser session.
Keys are scoped like subuser permissions and optional per-server allow-lists.

Create and revoke keys under **Security** → API keys (`/account/security`).
The plaintext token is shown **once** at create time.

## Auth

```http
Authorization: Bearer gt_…
```

- Prefix is always `gt_`.
- Cookie sessions still work for the panel UI; keys are for scripts / CI.
- CSRF Origin checks are skipped for Bearer (same as daemon tokens).
- Keys cannot manage other keys — create/revoke requires a panel login.
- Default rate limit: **120 requests / minute / key** (`API_KEY_RATE_LIMIT`).

## Permissions

Same strings as subusers (`control.start`, `file.read`, …) or `["*"]` for
everything the account can already do. Effective access is the **intersection**
of the key’s scopes and the account’s own server permissions (owner / admin /
subuser).

UI presets: Read only · Power + console · Files · Full access.

Optional `serverIds`: only those servers; omit for every server the account can see.

## Basics

Base URL is your panel origin, e.g. `https://guartrix.com`.

OpenAPI 3 sketch (Client + Application paths): [openapi.yaml](../openapi.yaml).

### List servers

```http
GET /api/servers
Authorization: Bearer gt_…
```

Returns the same JSON array as the dashboard (filtered by key server allow-list).

### Get one server

```http
GET /api/servers/:id
Authorization: Bearer gt_…
```

### Power

```http
POST /api/servers/:id/start
POST /api/servers/:id/stop
POST /api/servers/:id/restart
POST /api/servers/:id/kill
Authorization: Bearer gt_…
```

Needs `control.start` / `control.stop` / `control.restart` / `control.kill`.

### Files (basics)

```http
GET  /api/servers/:id/files?path=.
GET  /api/servers/:id/files/content?path=server.properties
GET  /api/servers/:id/files/download?path=server.properties
PUT  /api/servers/:id/files/content
     Body: { "path": "server.properties", "content": "…" }
POST /api/servers/:id/files/mkdir
     Body: { "path": "plugins/MyPlugin" }
POST /api/servers/:id/files/compress
     Body: { "paths": ["world"], "destination": "world.zip" }
POST /api/servers/:id/files/decompress
     Body: { "path": "world.zip" }
DELETE /api/servers/:id/files?path=…
```

Needs the matching `file.*` permissions (`file.download`, `file.archive` for download/zip).

### Schedules

```http
GET  /api/servers/:id/tasks
POST /api/servers/:id/tasks
     Body: { "mode": "daily", "dailyAt": "04:00", "steps": [
       { "kind": "backup" },
       { "kind": "wait", "delaySeconds": 30 },
       { "kind": "restart" }
     ]}
POST /api/servers/:id/tasks/:taskId/run
```

Needs `schedule.*`. Details: [Schedules](schedules.md).

### Databases, backups, world, allocations

These routes accept the same Bearer key when the key’s scopes allow them (see OpenAPI for full schemas):

| Area | Examples (permission-gated) |
|------|------------------------------|
| Databases | `GET/POST/DELETE /api/servers/:id/databases…` |
| Backups | list / create / restore / delete under `/api/servers/:id/backups…` |
| World | reset dimensions / upload zip under world tools routes |
| Allocations | list / assign extras under `/api/servers/:id/allocations…` |
| Resource pack | upload / settings when `settings.*` allows |

Prefer OpenAPI + the panel Network tab for allocation edge cases (UDP companions, Geyser). Machine-to-machine admin automation uses **Application** keys (`gta_…`) — see [Application API](application-api.md).

## Example (curl)

```bash
export GT_KEY='gt_…'
export PANEL='https://guartrix.com'

curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/servers" | jq '.[].name'

curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/SERVER_ID/restart"
```

## Manage keys (panel session)

```http
GET    /api/account/api-keys
POST   /api/account/api-keys   { "name", "permissions", "serverIds"? }
DELETE /api/account/api-keys/:id
```

These require a signed-in browser session (cookie + CSRF), not a Bearer key.

## Security notes

- Treat keys like passwords; revoke immediately if leaked.
- Prefer least privilege (Power + one server) over Full access.
- SFTP still uses the panel password — keys do not unlock SFTP.
- Max **10** active keys per account.

See also [Accounts & quotas](accounts-and-quotas.md) and [Security](security.md).
