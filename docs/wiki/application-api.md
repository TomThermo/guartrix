# Application API & Mollie billing

Guartrix separates three HTTP auth modes:

| Key | Prefix | Audience |
|-----|--------|------------|
| Client API | `gt_` | End users — own servers (+ optional admin scopes) |
| **Application API** | `gta_` | **Machine** — billing panels, provisioning, admin automation |
| Session | cookie | Browser UI |

Client API guide: [client-api.md](client-api.md) · Map: [api-overview.md](api-overview.md)

**Full request/response examples:** [api-examples.md](api-examples.md)

## Concepts

| Piece | Role |
|-------|------|
| **Plan template** | Quota preset + EUR price; optional auto-create + Mollie interval |
| **Mollie checkout** | Logged-in user pays → webhook → quotas applied |
| **Application API** | Create users, raise quotas, create/delete servers after external payment |
| **Outbound webhook** | Optional `BILLING_WEBHOOK_URL` on paid / provisioned events |

## Application API keys

**Admin → Billing → Application API keys**. Token prefix `gta_`, shown once.

```http
Authorization: Bearer gta_…
```

Rate limit: `APPLICATION_API_RATE_LIMIT` (default **120/min**).

### Scopes

| Scope | Access |
|-------|--------|
| `users.read` | List / get users |
| `users.write` | Create / update users (promoting to **ADMIN** requires Application scope `*`) |
| `users.delete` | Delete users |
| `servers.read` | List / get servers + connect/SFTP meta |
| `servers.write` | Create servers |
| `servers.update` | Patch server name, limits, owner, **suspend** |
| `servers.delete` | Delete servers (no password) |
| `servers.power` | Start / stop / restart / kill any server |
| `servers.files` | List / read / write / delete server files |
| `servers.addons` | List / install / remove mods & plugins |
| `servers.backups` | List / create / restore / delete backups |
| `servers.allocations` | List network ports for a server |
| `servers.databases` | List databases + rotate password |
| `plans.read` | List plan templates |
| `plans.write` | Create / update plans |
| `payments.read` | List payments |
| `nodes.read` | List nodes + capacity |
| `activity.read` | Panel activity log |
| `settings.read` | Public panel settings summary |
| `*` | All scopes above |

Presets (billing, read-only, provisioning, **server-ops**, full): `GET /api/account/api-reference` → `applicationApi.presets`.

## Endpoints

### Users

```http
GET    /api/application/users
GET    /api/application/users/:id
POST   /api/application/users
PATCH  /api/application/users/:id
DELETE /api/application/users/:id
Authorization: Bearer gta_…
```

List endpoints support pagination via `?limit=` / `?offset=` and return `{ users|servers, total, limit, offset }` (see [API conventions](api-conventions.md)).

Create body:

```json
{
  "username": "alice",
  "password": "……",
  "role": "OPERATOR",
  "maxServers": 1,
  "maxMemoryMb": 4096,
  "maxDatabases": 3
}
```

### Servers

```http
GET    /api/application/servers
GET    /api/application/servers/:id
POST   /api/application/servers
PATCH  /api/application/servers/:id
POST   /api/application/servers/:id/power
DELETE /api/application/servers/:id
```

Create body:

```json
{
  "ownerId": "USER_ID",
  "name": "Survival",
  "type": "PAPER",
  "mcVersion": "1.21.1",
  "port": 25565,
  "memoryMb": 4096,
  "diskMb": 10240,
  "nodeId": "optional-node-id"
}
```

Patch body (any field optional):

```json
{ "name": "Renamed", "memoryMb": 6144, "ownerId": "OTHER_USER", "suspended": true }
```

`suspended: true` stops a running server and blocks start/restart until cleared (billing / abuse).

### Power (Application API)

Requires `servers.power` scope:

```bash
curl -sS -X POST -H "Authorization: Bearer $GTA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"signal":"stop"}' \
  "$PANEL/api/application/servers/SERVER_ID/power"
```

Signals: `start`, `stop`, `restart`, `kill`. Returns updated server object.

**403 when suspended:**

```json
{ "error": "Server is suspended — contact support or renew your plan", "code": "SERVER_SUSPENDED" }
```

### Day-to-day server ops (Application mirrors)

Same shapes as the Client API, under `/api/application/servers/:id/…`:

| Scope | Paths |
|-------|-------|
| `servers.read` | `GET …/connect` (join address + SFTP meta) |
| `servers.files` | `GET/POST …/files`, `…/files/content`, `mkdir`, `rename`, `delete`, `compress` |
| `servers.addons` | `GET …/addons`, `POST …/addons/install`, `DELETE …/addons/:projectId` |
| `servers.backups` | `GET/POST …/backups`, `POST …/backups/:id/restore`, `DELETE …/backups/:id` |
| `servers.allocations` | `GET …/allocations` |
| `servers.databases` | `GET …/databases`, `POST …/databases/:dbId/rotate-password` |

Use preset **server-ops** or **billing** when minting a `gta_` key for WHMCS-style panels that manage live servers without per-user `gt_` keys.

### Nodes

```http
GET /api/application/nodes
```

Requires `nodes.read`. Returns the same node list as the create-server picker (memory usage, online status).

### Activity

```http
GET /api/application/activity?limit=50&offset=0&q=server.delete
```

Requires `activity.read`.

### Settings (read-only summary)

```http
GET /api/application/settings
```

Requires `settings.read`. Returns `publicHost`, registration flag, default quotas — not SMTP secrets.

### Plans & payments

```http
GET  /api/application/plans
POST /api/application/plans
GET  /api/application/payments
```

## Mollie (first-party checkout)

1. Set `MOLLIE_API_KEY=test_…` in `.env` and restart.
2. **Admin → Billing**: create plan templates.
3. Users pay via **Billing** in the nav.

Webhook: `https://<PUBLIC_HOST>/api/public/billing/mollie`

Details: existing sections below unchanged.

### Mollie setup

1. Create a Mollie account and API key (`test_…` or `live_…`).
2. Set in `.env`:

```bash
MOLLIE_API_KEY=test_…
# Optional: notify your storefront / billing bridge
# BILLING_WEBHOOK_URL=https://billing.example.com/hooks/guartrix
```

3. Restart the panel (`bash scripts/start.sh`).
4. **Admin → Billing**: create plan templates (slug, price in cents, quotas).
5. Users open **Billing** in the nav → **Pay with Mollie**.

Flow: create payment → customer pays on Mollie → webhook `id=tr_…` → panel
fetches payment → status `paid` → apply plan quotas once (idempotent).

## Session / panel endpoints (not Application API)

| Method | Path | Who |
|--------|------|-----|
| GET | `/api/billing/plans` | Any logged-in user (enabled plans) |
| POST | `/api/billing/checkout` | Session — start Mollie payment |
| GET | `/api/billing/payments` | Own payments |
| POST | `/api/billing/payments/:id/sync` | Sync from Mollie after redirect |
| GET/POST/PATCH/DELETE | `/api/admin/plans` | Admin |
| GET | `/api/admin/payments` | Admin |
| GET/POST/DELETE | `/api/admin/application-keys` | Admin session |

## Example: external panel after payment

```bash
export GTA='gta_…'
export PANEL='https://guartrix.com'

# Raise quotas
curl -sS -X PATCH -H "Authorization: Bearer $GTA" -H "Content-Type: application/json" \
  -d '{"maxServers":1,"maxMemoryMb":4096,"maxDatabases":3}' \
  "$PANEL/api/application/users/USER_ID"

# Create server for customer
curl -sS -X POST -H "Authorization: Bearer $GTA" -H "Content-Type: application/json" \
  -d '{"ownerId":"USER_ID","name":"Paid server","type":"PAPER","mcVersion":"1.21.1","port":25565,"memoryMb":4096}' \
  "$PANEL/api/application/servers"
```

## Client vs Application API — when to use which

| Need | Use |
|------|-----|
| Customer restarts **their** server from a script | `gt_` Client key |
| WHMCS creates account + server after payment | `gta_` Application key |
| Admin read-only monitoring script | `gt_` with `adminScopes` **or** `gta_` with `nodes.read` + `activity.read` |
| Panel UI | Browser session |

## Security

- Never embed `gta_` keys in browser apps; server-side only.
- Prefer Mollie **test** keys until go-live.
- Scope keys narrowly (`users.read` + `payments.read` for reporting only).
- See [Security](security.md) · [Client API](client-api.md).
