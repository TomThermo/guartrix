# Client API (personal API keys)

Automate **your own servers** (and, for ADMIN accounts, scoped panel admin tasks) with a personal **Client API key**.

Create keys under **Account → Security → API keys** (`/account/security`).
The plaintext token (`gt_…`) is shown **once** at create time.

Overview of all auth types: [API overview](api-overview.md).

## Auth

```http
Authorization: Bearer gt_…
```

| Topic | Detail |
|-------|--------|
| Prefix | Always `gt_` |
| Rate limit | **120 req/min/key** (`API_KEY_RATE_LIMIT`) |
| CSRF | Not required with Bearer |
| Key management | Session + CSRF only — keys cannot mint keys |
| SFTP | Panel password or app password — **not** `gt_` keys |
| Max keys | **10** active per account |

## Permissions

Keys use the same strings as **subusers** (`control.start`, `file.read`, …) or `["*"]` for everything the account may do on allowed servers.

**Effective access** = intersection of:

1. Key `permissions`
2. Account access (owner / subuser / admin on that server)
3. Optional key `serverIds` allow-list (omit = all visible servers)

### Presets (UI)

| Preset | Use |
|--------|-----|
| Read only | Stats, files read, settings read |
| Power + console | start / stop / restart / kill / console |
| Files | read / write / upload / archive |
| Monitoring | stats, logs, players, activity read |
| Backups | backup.* + schedule read |
| Databases | database.* |
| Full access | `["*"]` on allowed servers |

Full list + machine-readable catalog:

```http
GET /api/account/api-reference
```

## Account endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/account` | `gt_` or session | Profile, quotas, active key metadata |
| GET | `/api/account/session` | optional | Same shape as `/api/auth/me` (no CSRF token) |
| GET | `/api/account/api-reference` | public | Permissions, presets, admin scopes |
| GET | `/api/account/api-keys` | session | List keys |
| POST | `/api/account/api-keys` | session | Create key |
| DELETE | `/api/account/api-keys/:id` | session | Revoke key |

### Create key (session)

```http
POST /api/account/api-keys
Content-Type: application/json

{
  "name": "CI deploy",
  "permissions": ["control.start", "control.stop", "control.restart"],
  "serverIds": ["abc123"]
}
```

ADMIN accounts may also pass `adminScopes` (see below).

### Example: account profile

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/account" | jq '.user | {username, role, serverCount, maxServers, memoryUsedMb, maxMemoryMb}'
```

## Servers — collection

| Method | Path | Permission (typical) |
|--------|------|----------------------|
| GET | `/api/servers` | any key with server access |
| GET | `/api/servers/stats` | read |
| GET | `/api/servers/online` | read |
| POST | `/api/servers` | owner quota + write role |
| POST | `/api/servers/import` | multipart upload |
| GET | `/api/versions?type=PAPER` | authenticated |

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/servers" | jq
```

## Servers — single server

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/servers/:id` | Details |
| PATCH | `/api/servers/:id` | Name, limits (owner) |
| DELETE | `/api/servers/:id` | Owner + panel password |
| GET | `/api/servers/:id/stats` | Live CPU/RAM/disk |
| GET | `/api/servers/:id/stats/history` | Charts data |
| GET | `/api/servers/:id/connect` | Join address |
| POST | `/api/servers/:id/start` | `control.start` |
| POST | `/api/servers/:id/stop` | `control.stop` |
| POST | `/api/servers/:id/restart` | `control.restart` |
| POST | `/api/servers/:id/kill` | `control.kill` |

## Files

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/servers/:id/files?path=.` | `file.read` |
| GET | `/api/servers/:id/files/content?path=…` | `file.read-content` |
| PUT | `/api/servers/:id/files/content` | `file.update` |
| GET | `/api/servers/:id/files/download?path=…` | `file.download` |
| POST | `/api/servers/:id/files/upload` | `file.upload` |
| POST | `/api/servers/:id/files/mkdir` | `file.create` |
| POST | `/api/servers/:id/files/rename` | `file.update` |
| DELETE | `/api/servers/:id/files?path=…` | `file.delete` |
| POST | `/api/servers/:id/files/compress` | `file.archive` |
| POST | `/api/servers/:id/files/decompress` | `file.archive` |

## Backups

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/servers/:id/backups` | `backup.read` |
| POST | `/api/servers/:id/backups` | `backup.create` |
| POST | `/api/servers/:id/backups/:backupId/restore` | `backup.restore` |
| DELETE | `/api/servers/:id/backups/:backupId` | `backup.delete` |
| PUT | `/api/servers/:id/backups/schedule` | `schedule.update` |

## Databases

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/servers/:id/databases` | `database.read` |
| POST | `/api/servers/:id/databases` | `database.create` |
| DELETE | `/api/servers/:id/databases/:dbId` | `database.delete` |

## Schedules (tasks)

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/servers/:id/tasks` | `schedule.read` |
| POST | `/api/servers/:id/tasks` | `schedule.create` |
| PATCH | `/api/servers/:id/tasks/:taskId` | `schedule.update` |
| DELETE | `/api/servers/:id/tasks/:taskId` | `schedule.delete` |
| POST | `/api/servers/:id/tasks/:taskId/run` | `schedule.update` |

Example body: [Schedules](schedules.md).

## Players & moderation

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/servers/:id/players` | `player.read` |
| POST | `/api/servers/:id/whitelist/:name` | `player.update` |
| DELETE | `/api/servers/:id/whitelist/:name` | `player.update` |
| GET/POST | `/api/servers/:id/bans/…` | `player.update` |

## Settings, world, addons

| Area | Examples | Permissions |
|------|----------|-------------|
| Settings / startup | `/api/servers/:id/updates`, `engine`, `proxy` | `settings.*`, `startup.*` |
| World | `/api/servers/:id/world/reset`, `import` | owner / settings |
| Addons / modpacks | `/api/servers/:id/addons/…` | `addon.*` |
| Allocations | `/api/servers/:id/allocations` | `allocation.*` |
| Subusers | `/api/servers/:id/subusers` | `user.*` |
| Activity | `/api/servers/:id/activity` | `activity.read` |
| Logs | `/api/servers/:id/logs` | `audit.read` |

See [OpenAPI](../openapi.yaml) for request bodies.

## Nodes (read)

```http
GET /api/nodes
Authorization: Bearer gt_…
```

Returns nodes with memory usage — used when creating servers from automation.

## Admin scopes on Client keys

**ADMIN** accounts may attach **panel admin scopes** to a `gt_` key.
Without `adminScopes`, the key only works on **server** routes (like any other user).

```json
{
  "name": "Monitoring",
  "permissions": ["*"],
  "adminScopes": ["users.read", "nodes.read", "activity.read", "status.read"]
}
```

Or full panel admin:

```json
{ "adminScopes": ["*"] }
```

| Scope | Allows |
|-------|--------|
| `admin.full` or `*` | All `/api/admin/*` routes |
| `users.read` | `GET /api/users` |
| `users.write` | `POST` / `PATCH /api/users` |
| `users.delete` | `DELETE /api/users/:id` |
| `nodes.read` / `nodes.write` | Node list & admin node CRUD |
| `settings.read` / `settings.write` | Admin → Settings |
| `activity.read` | `GET /api/admin/activity` |
| `status.read` | Admin → Status |
| `billing.read` / `billing.write` | Plans & payments admin |
| `license.read` / `license.write` | License admin |

Presets: `GET /api/account/api-reference` → `adminPanelPresets`.

```bash
# List panel users with a read-only admin key
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/users" | jq '.users[].username'
```

## Error responses

| HTTP | Meaning |
|------|---------|
| 401 | Missing/invalid token |
| 403 | Missing permission or admin scope |
| 404 | Server not found or not on key allow-list |
| 429 | Rate limit exceeded |

## Security

- Treat `gt_` tokens like passwords; revoke on leak.
- Prefer least privilege: one server + minimal permissions.
- Use **Application API** (`gta_`) for billing storefronts — never embed in browsers.
- 2FA required roles must enroll TOTP before keys work (`TWO_FACTOR_REQUIRED_ROLES`).

See also [Application API](application-api.md) · [API overview](api-overview.md) · [Security](security.md).
