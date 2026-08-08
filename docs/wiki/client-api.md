# Client API (personal API keys)

Automate **your own servers** (and, for ADMIN accounts, scoped panel admin tasks) with a personal **Client API key**.

Create keys under **Account → Access → API keys** (`/account/security?tab=access`).
The plaintext token (`gt_…`) is shown **once** at create time.

Contact profile (name, email, phone, address) and password change live under **Account → Profile** and are **session-only** (cookie + CSRF) — not available with `gt_` keys.

Overview of all auth types: [API overview](api-overview.md).

**Worked examples with JSON outputs:** [API examples](api-examples.md) · [Conventions](api-conventions.md)

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
| GET | `/api/account` | `gt_` or session | Quotas + `AuthUser`, active key metadata |
| GET | `/api/account/session` | optional | Same shape as `/api/auth/me` (no CSRF token) |
| GET | `/api/account/api-reference` | public | Permissions, presets, admin scopes |
| GET | `/api/account/profile` | session | Contact profile (name, email, phone, address, `twoFactorEnabled`) |
| PATCH | `/api/account/profile` | session + CSRF | Update contact fields; `409 EMAIL_TAKEN` if email is used |
| GET | `/api/account/email-available` | session | Live email check (`?email=`); `{ available, own, valid }` |
| GET | `/api/account/address-suggest` | session | Address autocomplete (`?q=`) via OpenStreetMap |
| POST | `/api/account/password` | session + CSRF | Change password (`current` + `new` ×2; `totpCode` when 2FA on) |
| GET | `/api/account/api-keys` | session | List keys |
| POST | `/api/account/api-keys` | session | Create key |
| DELETE | `/api/account/api-keys/:id` | session | Revoke key |
| GET | `/api/account/app-passwords` | `gt_` or session | List SFTP app passwords (`gtap_`) |
| POST | `/api/account/app-passwords` | `gt_` or session | Create app password (API key requires panel `password` in body) |
| DELETE | `/api/account/app-passwords/:id` | `gt_` or session | Revoke (API key requires panel `password` in body) |

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

**Sample `200` response:**

```json
{
  "user": {
    "id": "k9m2pQx7nR4v",
    "username": "steve",
    "role": "OPERATOR",
    "maxServers": 3,
    "maxMemoryMb": 12288,
    "serverCount": 2,
    "memoryUsedMb": 6144
  },
  "apiKey": {
    "prefix": "gt_a1b2c3d4",
    "permissions": ["control.restart"],
    "serverIds": ["V1StGXR8_Z5j"],
    "adminScopes": null
  }
}
```

More examples: [API examples — Account](api-examples.md#account).

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
# Paginated (recommended for large fleets):
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/servers?limit=50&offset=0" | jq
```

Without `limit`/`offset`, returns a **JSON array** of server objects. With pagination query params, returns `{ servers, total, limit, offset }`. Each server includes `permissions` for your key.

Browser UI session traffic also uses separate rate budgets (`API_SESSION_RATE_LIMIT` vs `API_SESSION_READ_RATE_LIMIT`) — see [API conventions](api-conventions.md).

**Sample element:**

```json
{
  "id": "V1StGXR8_Z5j",
  "name": "Survival SMP",
  "type": "PAPER",
  "mcVersion": "1.21.1",
  "port": 25565,
  "memoryMb": 4096,
  "status": "RUNNING",
  "ownerUsername": "steve",
  "nodeName": "Node 1",
  "permissions": ["control.start", "control.restart", "file.read"]
}
```

Full list + create/import examples: [API examples — Servers](api-examples.md#servers).

## Servers — single server

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/servers/:id` | Details |
| PATCH | `/api/servers/:id` | Name, properties, alerts (memory/disk/CPU: **admin only**) |
| DELETE | `/api/servers/:id` | Owner + panel password (works with `gt_` — body `{ "password": "…" }`) |
| GET | `/api/servers/:id/stats` | Live CPU/RAM/disk |
| GET | `/api/servers/:id/stats/history` | Charts data |
| GET | `/api/servers/:id/connect` | Join address + SFTP host/port/username (`file.sftp`) |
| POST | `/api/servers/:id/start` | `control.start` |
| POST | `/api/servers/:id/stop` | `control.stop` |
| POST | `/api/servers/:id/restart` | `control.restart` |
| POST | `/api/servers/:id/kill` | `control.kill` |
| POST | `/api/servers/:id/power` | Unified signal: `{ "signal": "start" \| "stop" \| "restart" \| "kill" }` |
| POST | `/api/servers/:id/command` | `{ "command": "say Hello" }` — returns `lines` / `output` — `control.console` |
| GET | `/api/servers/:id/websocket` | WebSocket URLs + auth hint — `control.console.read` |
| GET | `/api/servers/:id/logs` | Log file list — `audit.read` |
| GET | `/api/servers/:id/logs/content?path=…` | Log file contents — `audit.read` |

### Power (unified)

Single endpoint for all power signals:

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"signal":"restart"}' \
  "$PANEL/api/servers/$SERVER_ID/power" | jq
```

### Console command (HTTP)

For streaming output use the WebSocket (see below). One-shot commands:

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"list"}' \
  "$PANEL/api/servers/$SERVER_ID/command"
```

**200:** `{ "ok": true, "command", "lines": [...], "output": "…" }`

Optional: `timeoutMs`, `idleMs` to wait longer for slow commands.

### Console WebSocket

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/$SERVER_ID/websocket" | jq
```

Connect to `socket` with the same `Authorization: Bearer gt_…` header. Send JSON: `{"type":"command","command":"say Hello"}`.

Events: `history`, `output`, `status`, `stats`, `error`.

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
| POST | `/api/servers/:id/databases/:dbId/rotate-password` | `database.update` |
| DELETE | `/api/servers/:id/databases/:dbId` | `database.delete` |

`rotate-password` returns the database object with a **new plaintext password** (same shape as create).

### SFTP credentials

1. `GET /api/servers/:id/connect` → `sftpHost`, `sftpPort`, `sftpUsername` (needs `file.sftp`)
2. `POST /api/account/app-passwords` with `{ "name": "FileZilla", "password": "YOUR_PANEL_PASSWORD" }` → one-time `token` (`gtap_…`)

App passwords are for SFTP only — not HTTP Bearer.

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
| `admin.full` or `*` | All `/api/admin/*` routes (required for Application API key minting and a few privileged helpers) |
| `users.read` | `GET /api/users` |
| `users.write` | `POST` / `PATCH /api/users` (non-ADMIN roles; cannot demote/delete the last admin). Creating or promoting **ADMIN** requires `admin.full` / `*` on Client keys |
| `users.delete` | `DELETE /api/users/:id` |
| `nodes.read` / `nodes.write` | Node list & admin node CRUD / install / token rotate |
| `settings.read` / `settings.write` | Admin → Settings (+ test mail/redis) |
| `activity.read` | `GET /api/admin/activity` |
| `status.read` | Admin → Status / version |
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
