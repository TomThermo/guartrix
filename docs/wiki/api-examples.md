# API examples (requests & responses)

Copy-paste examples for the Guartrix HTTP API. Assumes [conventions](api-conventions.md) (Bearer auth, JSON, error shape).

**Quick links:** [Account](#account) · [Servers](#servers) · [Power](#power--stats) · [Files](#files) · [Backups](#backups) · [Databases](#databases) · [Schedules](#schedules-tasks) · [Players](#players) · [Nodes & versions](#nodes--versions) · [Application API](#application-api) · [Admin (Client key)](#admin-via-client-api-key)

---

## Account

### GET `/api/account` — profile + quotas

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/account" | jq
```

**200 response:**

```json
{
  "user": {
    "id": "k9m2pQx7nR4v",
    "username": "steve",
    "role": "OPERATOR",
    "createdAt": "2026-01-15T10:22:00.000Z",
    "twoFactorEnabled": true,
    "twoFactorRequired": false,
    "maxServers": 3,
    "maxMemoryMb": 12288,
    "maxDatabases": 5,
    "serverCount": 2,
    "memoryUsedMb": 6144,
    "databaseCount": 1
  },
  "apiKey": {
    "prefix": "gt_a1b2c3d4",
    "permissions": ["control.start", "control.stop", "control.restart"],
    "serverIds": ["V1StGXR8_Z5j"],
    "adminScopes": null
  }
}
```

`apiKey` is `null` when using a browser session instead of Bearer.

### GET `/api/account/profile` — contact profile (session)

Session cookie required (not available with `gt_` keys).

```bash
curl -sS -H "Cookie: sid=…" "$PANEL/api/account/profile" | jq
```

**200 response:**

```json
{
  "profile": {
    "username": "steve",
    "email": "steve@example.com",
    "emailVerified": true,
    "twoFactorEnabled": true,
    "displayName": "Steve",
    "phoneCountry": "NL",
    "phoneNational": "612345678",
    "phoneE164": "+31612345678",
    "addressLine1": "Damrak 1",
    "addressLine2": null,
    "addressCity": "Amsterdam",
    "addressPostalCode": "1012LG",
    "addressCountry": "NL",
    "addressLat": 52.37,
    "addressLon": 4.89,
    "addressVerifiedAt": "2026-08-07T12:00:00.000Z"
  }
}
```

### GET `/api/account/email-available` — live email check (session)

```bash
curl -sS -H "Cookie: sid=…" \
  "$PANEL/api/account/email-available?email=taken@example.com" | jq
```

**200 response (taken):**

```json
{ "available": false, "own": false, "valid": true, "code": "EMAIL_TAKEN" }
```

**200 response (free / own):**

```json
{ "available": true, "own": false, "valid": true }
```

### PATCH `/api/account/profile` — update contact fields (session)

```bash
curl -sS -X PATCH "$PANEL/api/account/profile" \
  -H "Content-Type: application/json" \
  -H "Cookie: sid=…" \
  -H "x-csrf-token: …" \
  -H "Origin: $PANEL" \
  -d '{
    "displayName": "Steve",
    "email": "steve@example.com",
    "phoneCountry": "NL",
    "phoneNational": "612345678"
  }' | jq
```

**409** when the email belongs to another account: `{ "error": "Email already registered", "code": "EMAIL_TAKEN" }`.

### POST `/api/account/password` — change password (session)

Enter the new password twice. When 2FA is on, include `totpCode`.

```bash
curl -sS -X POST "$PANEL/api/account/password" \
  -H "Content-Type: application/json" \
  -H "Cookie: sid=…" \
  -H "x-csrf-token: …" \
  -H "Origin: $PANEL" \
  -d '{
    "currentPassword": "OldStr0ng!Pass",
    "newPassword": "NewStr0ng!Pass",
    "confirmPassword": "NewStr0ng!Pass",
    "totpCode": "123456"
  }' | jq
```

**200:** `{ "ok": true }`  
Errors: `400` (mismatch / `TOTP_REQUIRED`), `401` (`BAD_PASSWORD` / `BAD_TOTP`).

### GET `/api/account/api-reference` — permission catalog (public)

```bash
curl -sS "$PANEL/api/account/api-reference" | jq '.clientApi.presets'
```

**200 response (truncated):**

```json
{
  "clientApi": {
    "tokenPrefix": "gt_",
    "rateLimitPerMinute": 120,
    "maxKeysPerUser": 10,
    "serverPermissions": ["control.start", "control.stop", "…"],
    "permissionGroups": [ … ],
    "presets": [
      {
        "id": "read",
        "label": "Read only",
        "description": "List servers, read files and settings — no power or writes.",
        "permissions": ["file.read", "settings.read", "…"]
      }
    ],
    "adminPanelScopes": ["users.read", "users.write", "…"],
    "adminPanelPresets": [ … ]
  },
  "applicationApi": {
    "tokenPrefix": "gta_",
    "scopes": ["users.read", "servers.write", "…"],
    "presets": [ … ]
  }
}
```

### POST `/api/account/api-keys` — create key (session only)

```bash
curl -sS -X POST "$PANEL/api/account/api-keys" \
  -H "Content-Type: application/json" \
  -H "Cookie: sid=…" \
  -H "x-csrf-token: …" \
  -H "Origin: $PANEL" \
  -d '{
    "name": "CI restart bot",
    "permissions": ["control.start", "control.stop", "control.restart"],
    "serverIds": ["V1StGXR8_Z5j"]
  }'
```

**201 response:**

```json
{
  "key": {
    "id": "key7x9m2pQ",
    "name": "CI restart bot",
    "prefix": "gt_a1b2c3d4",
    "permissions": ["control.start", "control.stop", "control.restart"],
    "serverIds": ["V1StGXR8_Z5j"],
    "adminScopes": null,
    "lastUsedAt": null,
    "createdAt": "2026-08-06T08:20:00.000Z",
    "revokedAt": null
  },
  "token": "gt_a1b2c3d4xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

Save `token` immediately — it is never shown again.

---

## Servers

### GET `/api/servers` — list your servers

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/servers" | jq '.[0]'
```

**200 response:** JSON **array** of server objects (not wrapped in `{ servers: … }`).

```json
[
  {
    "id": "V1StGXR8_Z5j",
    "name": "Survival SMP",
    "type": "PAPER",
    "mcVersion": "1.21.1",
    "port": 25565,
    "memoryMb": 4096,
    "diskMb": 10240,
    "cpuLimit": 200,
    "status": "RUNNING",
    "javaVersion": "21",
    "startupCommand": null,
    "serverJar": "server.jar",
    "fabricLoaderVersion": null,
    "forgeVersion": null,
    "paperBuild": 133,
    "errorMessage": null,
    "hasIcon": true,
    "whitelistEnabled": false,
    "autoRestart": true,
    "startOnBoot": false,
    "stoppedByUser": false,
    "ownerId": "k9m2pQx7nR4v",
    "ownerUsername": "steve",
    "nodeId": "node_local01",
    "nodeName": "Node 1",
    "subdomain": "survival",
    "extraMounts": null,
    "createdAt": "2026-03-01T14:00:00.000Z",
    "updatedAt": "2026-08-06T07:55:00.000Z",
    "permissions": ["control.start", "control.stop", "file.read"]
  }
]
```

`permissions` on each row = what **your** key/account can do on that server.

### GET `/api/servers/:id` — server detail

Returns `ServerDetail`: McServer fields + `properties` (server.properties) + `players` snapshot.

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j" | jq '.properties.motd, .players'
```

**200 response (partial):**

```json
{
  "id": "V1StGXR8_Z5j",
  "name": "Survival SMP",
  "type": "PAPER",
  "status": "RUNNING",
  "properties": {
    "motd": "§aSurvival §7| §fGuartrix",
    "max-players": "20",
    "difficulty": "easy",
    "white-list": "false",
    "online-mode": "true"
  },
  "players": {
    "online": true,
    "players": ["Notch", "jeb_"],
    "max": 20,
    "version": "1.21.1"
  }
}
```

### POST `/api/servers` — create server

Requires `OPERATOR` or `ADMIN`, quota, and write role.

**Auto placement:** omit `nodeId` and `storageId` to let the panel pick a deployable node with the most free **RAM**, then **CPU**, then the storage pool (or node `DATA_DIR`) with the most free disk on that node. Prefer **ONLINE** nodes when several qualify.

**Manual overrides (admin):** set `nodeId` and/or `storageId`. Set `"storageId": null` to force the node default `DATA_DIR` instead of a pool.

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Creative flat",
    "type": "PAPER",
    "mcVersion": "1.21.1",
    "paperBuild": 112,
    "port": 25566,
    "memoryMb": 2048,
    "diskMb": 10240,
    "cpuLimit": 200,
    "worldPreset": "FLAT",
    "gamemode": "creative",
    "difficulty": "peaceful",
    "seed": "12345"
  }' \
  "$PANEL/api/servers"
```

**Admin — pick node + NFS pool manually:**

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Survival NFS",
    "type": "PAPER",
    "mcVersion": "1.21.1",
    "port": 25567,
    "memoryMb": 4096,
    "diskMb": 20480,
    "cpuLimit": 300,
    "nodeId": "bZG8tvAfekk0",
    "storageId": "7cCX2CZ3vZUM"
  }' \
  "$PANEL/api/servers"
```

List pools linked to a node: `GET /api/admin/nodes/:id/storages` (admin session or full admin API key).

| Field | Required | Notes |
|-------|----------|-------|
| `name` | yes | 1–64 chars |
| `type` | yes | `PAPER`, `VANILLA`, `FABRIC`, `BEDROCK`, … |
| `mcVersion` | yes | From `GET /api/versions?type=PAPER` |
| `port` | yes | 1024–65535; use `GET /api/nodes/:id/suggested-port` |
| `memoryMb` | yes | 512–65536 |
| `diskMb` | no | Default 10240 |
| `cpuLimit` | no | `0` = unlimited, `200` = 2 cores |
| `nodeId` | no | Admin only; auto-pick best node if omitted |
| `storageId` | no | Admin only; auto-pick best pool on the node if omitted; `null` = `DATA_DIR` |
| `paperBuild` | no | Paper/Purpur build id (`GET /api/versions/builds?type=PAPER&mcVersion=…`) |
| `fabricLoaderVersion` | no | Fabric/Quilt loader pin |
| `forgeVersion` | no | Forge/NeoForge full version pin |
| `worldPreset` | no | `DEFAULT`, `FLAT`, `VOID` |
| `seed`, `gamemode`, `difficulty` | no | Applied to new world |

**201 response:** Same object shape as one element from `GET /api/servers` (without `permissions`).

**409 example:**

```json
{ "error": "Port 25565/tcp is already in use" }
```

### GET `/api/servers/:id/connect` — join address & SFTP

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/connect" | jq
```

**200 response:**

```json
{
  "host": "survival.example.com",
  "port": 25565,
  "address": "survival.example.com",
  "directIp": "203.0.113.10",
  "subdomain": "survival.example.com",
  "motd": "§aSurvival",
  "maxPlayers": "20",
  "onlineMode": true,
  "whitelistEnabled": false,
  "mcVersion": "1.21.1",
  "onlinePlayers": 3,
  "playersMax": 20,
  "serverStatus": "RUNNING",
  "sftpEnabled": true,
  "sftpHost": "node1.example.com",
  "sftpPort": 2022,
  "sftpUsername": "steve.V1StGXR8_Z5j"
}
```

---

## Power & stats

### POST `/api/servers/:id/start` — start server

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/start"
```

**Permission:** `control.start`  
**200:** Updated `McServer` (often `status: "STARTING"`).

### POST `/api/servers/:id/stop` — stop server

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/stop"
```

**Permission:** `control.stop`

### POST `/api/servers/:id/restart` — restart server

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/restart"
```

**Permission:** `control.restart`

### POST `/api/servers/:id/kill` — force kill

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/kill"
```

**Permission:** `control.kill` — skips graceful Minecraft `stop`.

### POST `/api/servers/:id/power` — unified power (optional)

Same actions in one endpoint:

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"signal":"start"}' \
  "$PANEL/api/servers/V1StGXR8_Z5j/power"
```

Signals: `start`, `stop`, `restart`, `kill`.

**403 example:**

```json
{ "error": "Missing permission: control.start" }
```

**403 when suspended:**

```json
{ "error": "Server is suspended — contact support or renew your plan", "code": "SERVER_SUSPENDED" }
```

### POST `/api/servers/:id/command` — send console command (HTTP)

Sends the command, then waits briefly for console output and returns the lines.

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"list"}' \
  "$PANEL/api/servers/V1StGXR8_Z5j/command" | jq
```

**200 response:**

```json
{
  "ok": true,
  "command": "list",
  "lines": [
    "There are 2 of a max of 20 players online: Steve, Alex"
  ],
  "output": "There are 2 of a max of 20 players online: Steve, Alex",
  "timedOut": false
}
```

Optional body fields: `timeoutMs` (default 2500, max 15000), `idleMs` (quiet period after last line, default 450).

**409** when server is offline. For live streaming use the WebSocket instead.

### GET `/api/servers/:id/websocket` — WebSocket connection info

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/websocket" | jq
```

**200 response:**

```json
{
  "socket": "wss://guartrix.com/ws/servers/V1StGXR8_Z5j/console",
  "players": "wss://guartrix.com/ws/servers/V1StGXR8_Z5j/players",
  "auth": "Authorization: Bearer gt_… on the WebSocket upgrade request",
  "send": { "type": "command", "command": "say Hello" },
  "events": ["history", "output", "status", "stats", "error"],
  "permissions": { "read": true, "send": true }
}
```

**403 example (power):**

```json
{ "error": "Missing permission: control.restart" }
```

### GET `/api/servers/:id/stats` — live Docker stats

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/stats?disk=1" | jq
```

**200 response:**

```json
{
  "running": true,
  "cpuPercent": 42.5,
  "memoryUsedBytes": 2147483648,
  "memoryLimitBytes": 4294967296,
  "memoryPercent": 50.0,
  "networkRxBytes": 104857600,
  "networkTxBytes": 52428800,
  "blockReadBytes": 1073741824,
  "blockWriteBytes": 536870912,
  "pids": 48,
  "uptimeMs": 3600000,
  "memoryUsedLabel": "2.0 GiB",
  "memoryLimitLabel": "4.0 GiB",
  "networkRxLabel": "100.0 MiB",
  "networkTxLabel": "50.0 MiB",
  "blockReadLabel": "1.0 GiB",
  "blockWriteLabel": "500.0 MiB",
  "disk": {
    "usedBytes": 5368709120,
    "quotaBytes": 10737418240,
    "usedPercent": 50.0
  }
}
```

### GET `/api/servers/stats` — dashboard bulk stats

Returns a map keyed by server id (for all servers you can see):

```json
{
  "V1StGXR8_Z5j": { "running": true, "cpuPercent": 12.1, "…": "…" },
  "abc987654321": { "running": false, "cpuPercent": 0, "…": "…" }
}
```

### GET `/api/servers/:id/stats/history` — chart samples

```json
{
  "samples": [
    {
      "t": 1722924000000,
      "cpuPercent": 35.2,
      "memoryPercent": 48.1,
      "networkRxBytes": 1000,
      "networkTxBytes": 500
    }
  ]
}
```

---

## Files

### GET `/api/servers/:id/files?path=.` — list directory

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/files?path=plugins" | jq
```

**200 response:**

```json
{
  "path": "plugins",
  "entries": [
    {
      "name": "EssentialsX",
      "path": "plugins/EssentialsX",
      "type": "dir",
      "size": 4096,
      "modifiedAt": "2026-08-05T18:30:00.000Z",
      "editable": true
    },
    {
      "name": "server.properties",
      "path": "server.properties",
      "type": "file",
      "size": 1420,
      "modifiedAt": "2026-08-06T07:00:00.000Z",
      "editable": true
    }
  ]
}
```

### GET `/api/servers/:id/files/content?path=server.properties`

**200 response:**

```json
{
  "path": "server.properties",
  "content": "motd=Survival\\nmax-players=20\\n…",
  "size": 1420,
  "modifiedAt": "2026-08-06T07:00:00.000Z"
}
```

### PUT `/api/servers/:id/files/content` — save file

```bash
curl -sS -X PUT -H "Authorization: Bearer $GT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path": "server.properties", "content": "motd=Hello\\nmax-players=30\\n"}' \
  "$PANEL/api/servers/V1StGXR8_Z5j/files/content"
```

**200 response:**

```json
{ "ok": true }
```

### POST `/api/servers/:id/files/mkdir`

```json
{ "path": "plugins/MyPlugin" }
```

### POST `/api/servers/:id/files/compress`

```json
{
  "paths": ["world", "plugins"],
  "destination": "backup-manual.zip"
}
```

### DELETE `/api/servers/:id/files?path=old-world`

**200:** `{ "ok": true }`

---

## Backups

### GET `/api/servers/:id/backups`

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/backups" | jq
```

**200 response:**

```json
{
  "backups": [
    {
      "id": "20260806-040000",
      "name": "20260806-040000",
      "sizeBytes": 524288000,
      "sizeLabel": "500.0 MiB",
      "createdAt": "2026-08-06T04:00:00.000Z",
      "encrypted": true,
      "locked": false
    }
  ],
  "schedule": {
    "enabled": true,
    "mode": "daily",
    "dailyAt": "04:00",
    "retention": 7
  }
}
```

### POST `/api/servers/:id/backups` — create backup now

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/V1StGXR8_Z5j/backups"
```

**201:** New backup object in response (same shape as list item).

### POST `/api/servers/:id/backups/:backupId/restore`

Stops server if needed, restores files, may restart.

**200:**

```json
{ "ok": true, "server": { "id": "…", "status": "STARTING", "…": "…" } }
```

---

## Databases

### GET `/api/servers/:id/databases`

```json
{
  "databases": [
    {
      "id": "db8k2m9pQx",
      "serverId": "V1StGXR8_Z5j",
      "nodeId": "node_local01",
      "name": "s12345_survival",
      "username": "u12345_ab",
      "password": "generated-secret",
      "host": "203.0.113.10",
      "port": 3306,
      "remote": "%",
      "jdbcUrl": "jdbc:mysql://203.0.113.10:3306/s12345_survival",
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-01T12:00:00.000Z"
    }
  ]
}
```

### POST `/api/servers/:id/databases`

```json
{ "name": "myplugin_db" }
```

**201:** Single database object (includes generated `password` once).

### POST `/api/servers/:id/databases/:dbId/rotate-password`

No body. Returns `{ "database": { …, "password": "new-secret" } }` — requires `database.update`.

### SFTP app password

```bash
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"FileZilla","password":"YOUR_PANEL_PASSWORD"}' \
  "$PANEL/api/account/app-passwords" | jq '{prefix: .password.prefix, token: .token}'
```

Use `token` as the SFTP password with username from `GET …/connect`.

---

## Schedules (tasks)

### GET `/api/servers/:id/tasks`

```json
{
  "tasks": [
    {
      "id": "task_daily_backup",
      "enabled": true,
      "kind": "chain",
      "mode": "daily",
      "dailyAt": "04:00",
      "note": "Nightly backup + restart",
      "steps": [
        { "kind": "backup" },
        { "kind": "wait", "delaySeconds": 30 },
        { "kind": "restart" }
      ],
      "lastRunAt": "2026-08-06T04:00:12.000Z",
      "nextRunAt": "2026-08-07T04:00:00.000Z"
    }
  ]
}
```

### POST `/api/servers/:id/tasks` — create schedule

```json
{
  "mode": "daily",
  "dailyAt": "04:00",
  "note": "Restart at 4am",
  "steps": [
    { "kind": "backup" },
    { "kind": "restart" }
  ]
}
```

**201:** Created task object.

### POST `/api/servers/:id/tasks/:taskId/run` — run now

**200:** `{ "ok": true }`

---

## Players

### GET `/api/servers/:id/players`

```json
{
  "online": true,
  "players": [
    { "name": "Notch", "uuid": "069a79f4-…", "displayName": "Notch" }
  ],
  "max": 20,
  "version": "1.21.1"
}
```

### POST `/api/servers/:id/whitelist/Notch` — add to whitelist

Empty body. **200:** `{ "ok": true }`

### GET `/api/servers/:id/bans/players`

```json
{
  "players": [
    {
      "name": "griefer123",
      "reason": "Griefing spawn",
      "source": "admin",
      "created": "2026-08-01T10:00:00.000Z",
      "expires": null
    }
  ]
}
```

---

## Nodes & versions

### GET `/api/nodes` — pick a node for create

```json
{
  "nodes": [
    {
      "id": "node_local01",
      "name": "Node 1",
      "fqdn": "node1.example.com",
      "status": "ONLINE",
      "isLocal": true,
      "location": "AMS",
      "memoryMb": 32768,
      "memoryUsedMb": 12288,
      "memoryAvailableMb": 20480,
      "memoryUsableMb": 18432,
      "memoryReserveMb": 2048,
      "serverCount": 4
    }
  ]
}
```

### GET `/api/nodes/:id/suggested-port?type=PAPER`

```json
{ "port": 25567, "protocol": "tcp" }
```

### GET `/api/versions?type=PAPER`

```json
{
  "type": "PAPER",
  "versions": ["1.21.1", "1.21", "1.20.6", "1.20.4"]
}
```

---

## Application API

Machine keys (`gta_`) for billing / provisioning. **Never** put these in browser code.

### GET `/api/application/users`

```bash
curl -sS -H "Authorization: Bearer $GTA_KEY" \
  "$PANEL/api/application/users" | jq '.users[0]'
```

**200 response:**

```json
{
  "users": [
    {
      "id": "k9m2pQx7nR4v",
      "username": "alice",
      "role": "OPERATOR",
      "createdAt": "2026-01-15T10:22:00.000Z",
      "maxServers": 1,
      "maxMemoryMb": 4096,
      "maxDatabases": 2,
      "email": "alice@example.com",
      "emailVerified": true,
      "serverCount": 0,
      "memoryUsedMb": 0,
      "databaseCount": 0
    }
  ]
}
```

### POST `/api/application/users` — provision account

```bash
curl -sS -X POST -H "Authorization: Bearer $GTA_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "bob",
    "password": "Str0ng!Passw0rd",
    "role": "OPERATOR",
    "maxServers": 1,
    "maxMemoryMb": 4096,
    "maxDatabases": 1
  }' \
  "$PANEL/api/application/users"
```

**201:** `{ "user": { … } }`

### PATCH `/api/application/users/:id` — raise quotas

```json
{
  "maxServers": 2,
  "maxMemoryMb": 8192,
  "maxDatabases": 3
}
```

### GET `/api/application/storages`

Requires `nodes.read`. Lists global storage pools (local/NFS) with node links — use `id` as `storageId` on create.

### GET `/api/application/nodes/:id/storages`

Pools linked to one node (same shape as admin `GET /api/admin/nodes/:id/storages`).

### POST `/api/application/servers` — create server for user

**Placement:** omit `nodeId` and `storageId` for auto (most free **RAM** → **CPU** → disk). Set `nodeId` and/or `storageId` manually; `"storageId": null` forces node `DATA_DIR`.

```json
{
  "ownerId": "k9m2pQx7nR4v",
  "name": "Paid server",
  "type": "PAPER",
  "mcVersion": "1.21.1",
  "port": 25565,
  "memoryMb": 4096,
  "diskMb": 10240
}
```

With storage pool:

```json
{
  "ownerId": "k9m2pQx7nR4v",
  "name": "Paid server",
  "type": "PAPER",
  "mcVersion": "1.21.1",
  "port": 25565,
  "memoryMb": 4096,
  "diskMb": 10240,
  "nodeId": "NODE_ID",
  "storageId": "STORAGE_POOL_ID"
}
```

**201:** `{ "server": { … McServer fields … } }`

### POST `/api/application/servers/:id/power` — billing automation

Requires `servers.power` scope:

```bash
curl -sS -X POST -H "Authorization: Bearer $GTA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"signal":"stop"}' \
  "$PANEL/api/application/servers/V1StGXR8_Z5j/power"
```

### PATCH `/api/application/servers/:id` — suspend unpaid server

```json
{ "suspended": true }
```

Stops the server if running and blocks start until `suspended: false`.

### GET `/api/application/nodes`

Same shape as `GET /api/nodes` but requires `nodes.read` scope.

### GET `/api/application/activity?limit=10`

```json
{
  "total": 500,
  "offset": 0,
  "limit": 10,
  "events": [
    {
      "id": "evt_abc123",
      "action": "server.start",
      "category": "power",
      "serverId": "V1StGXR8_Z5j",
      "serverName": "Survival SMP",
      "userId": "k9m2pQx7nR4v",
      "actorName": "steve",
      "actorIp": "198.51.100.42",
      "success": true,
      "metadata": null,
      "createdAt": "2026-08-06T08:10:00.000Z"
    }
  ]
}
```

### GET `/api/application/settings`

```json
{
  "publicHost": "guartrix.com",
  "publicBaseUrl": "https://guartrix.com",
  "registrationEnabled": true,
  "defaultMaxServers": 0,
  "defaultMaxMemoryMb": 0,
  "defaultMaxDatabases": 0
}
```

---

## Admin via Client API key

ADMIN account with `adminScopes` on the `gt_` key.

### GET `/api/users`

```bash
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/users" | jq
```

Requires `adminScopes` containing `users.read` or `*`.

**200 response:**

```json
{
  "users": [
    {
      "id": "k9m2pQx7nR4v",
      "username": "steve",
      "role": "OPERATOR",
      "maxServers": 3,
      "maxMemoryMb": 12288,
      "maxDatabases": 5,
      "serverCount": 2,
      "memoryUsedMb": 6144,
      "createdAt": "2026-01-15T10:22:00.000Z"
    }
  ]
}
```

### GET `/api/admin/activity?limit=20`

Same event shape as Application activity. Requires `activity.read` or `admin.full`.

---

## Common workflows

### Restart server when CPU > 90% (bash loop)

```bash
STATS=$(curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/$SERVER_ID/stats")
CPU=$(echo "$STATS" | jq '.cpuPercent')
if (( $(echo "$CPU > 90" | bc -l) )); then
  curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
    "$PANEL/api/servers/$SERVER_ID/restart"
fi
```

### WHMCS: after payment → user + server

```bash
# 1. Create or patch user quotas
USER_ID=$(curl -sS -X POST -H "Authorization: Bearer $GTA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"username":"customer1","password":"…","maxServers":1,"maxMemoryMb":4096}' \
  "$PANEL/api/application/users" | jq -r '.user.id')

# 2. Create server
curl -sS -X POST -H "Authorization: Bearer $GTA_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"ownerId\":\"$USER_ID\",\"name\":\"MC\",\"type\":\"PAPER\",\"mcVersion\":\"1.21.1\",\"port\":25565,\"memoryMb\":4096}" \
  "$PANEL/api/application/servers"
```

### Edit server.properties from CI

```bash
CONTENT=$(curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/$ID/files/content?path=server.properties" | jq -r '.content')
# … modify $CONTENT …
curl -sS -X PUT -H "Authorization: Bearer $GT_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg c "$CONTENT" '{path:"server.properties",content:$c}')" \
  "$PANEL/api/servers/$ID/files/content"
```

---

## See also

- [API conventions](api-conventions.md) — errors, rate limits, auth
- [Client API](client-api.md) — permissions & endpoint index
- [Application API](application-api.md) — scopes & Mollie
- [OpenAPI](../openapi.yaml)
