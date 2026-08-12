# Guartrix HTTP API overview

## Quick start (Client API)

See **[API examples](api-examples.md)** for full request/response JSON.

```bash
export PANEL='https://guartrix.com'
export GT_KEY='gt_…'

# Permission catalog (no auth)
curl -sS "$PANEL/api/account/api-reference" | jq '.clientApi.presets[].id'

# Who am I + quotas
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/account" | jq '.user'

# My servers (array of McServer objects)
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/servers" | jq '.[].name'

# Live stats for one server
curl -sS -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/SERVER_ID/stats" | jq '{cpu: .cpuPercent, ram: .memoryPercent}'

# Restart
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/SERVER_ID/restart"
```

Bearer requests skip CSRF; cookie sessions need `Origin` + `x-csrf-token` on mutating calls.
Client keys cannot create other keys (use a panel session for key management).
Default rate limit: **120 requests / minute / key** (`API_KEY_RATE_LIMIT`).

## What hosting panels need (Guartrix coverage)

Guartrix exposes:

| Need | Client API (`gt_`) | Application API (`gta_`) |
|------|-------------------|--------------------------|
| Create server (user) | `POST /api/servers` (auto node + storage if omitted) | — |
| Create server (admin/billing) | — | `POST /api/application/servers` (auto node if `nodeId` omitted) |
| Start / stop / restart / kill | `POST …/power` or `/start` etc. | `POST /api/application/servers/:id/power` |
| Console (live) | WebSocket `/ws/servers/:id/console` | — (use Client key on that server) |
| Console (one command) | `POST …/command` | — |
| Read logs (files) | `GET …/logs` | — |
| Files / backups / DB / schedules | Full REST under `/api/servers/:id/…` | Same under `/api/application/servers/:id/…` (scoped) |
| Suspend unpaid server | — | `PATCH …/servers/:id` `{ "suspended": true }` |
| User provisioning | — | `POST /api/application/users` |
| Subusers | `POST …/subusers` | — |

Client keys use the **same routes as the panel UI** (not a separate `/api/client` prefix).

## API surface by audience

### Everyone (public)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | Liveness |
| GET | `/api/ready` | DB + optional local daemon |
| GET | `/api/auth/config` | Registration / password policy |
| POST | `/api/auth/login`, `/register`, … | Session auth |
| GET | `/api/account/api-reference` | Permission & scope catalog |

### Account owner (`gt_` or session)

| Area | Base path | Guide |
|------|-----------|-------|
| Quotas & AuthUser | `/api/account`, `/api/auth/me` | [Client API](client-api.md) |
| Contact profile / password (session) | `/api/account/profile`, `/email-available`, `/password`, `/address-suggest` | [Client API](client-api.md) · [API examples](api-examples.md#account) |
| Servers (CRUD, power, files, …) | `/api/servers/:id/…` | [Client API](client-api.md) · [Server management](server-management.md) |
| Nodes (picker) | `/api/nodes` | Create-server flow |
| Versions | `/api/versions?type=PAPER` | Create / change type |
| Billing (self) | `/api/billing/…` | Session only for checkout |

Server routes enforce **subuser-style permissions** on the key intersected with the account’s access.
Optional `serverIds` on the key limits which servers the token may touch.

### Panel admin

Two options:

1. **Client API key with `adminScopes`** (ADMIN account) — same `/api/admin/*` and `/api/users/*` routes as the UI, scoped per key.
2. **Application API key** (`gta_`) — machine automation under `/api/application/*` (users, servers, plans, nodes, activity, settings).

See [Client API — admin scopes](client-api.md#admin-scopes-on-client-keys) and [Application API](application-api.md).

### Internal

| Path | Consumer |
|------|----------|
| `/api/internal/sftp-auth` | Daemon SFTP auth |
| `/api/public/billing/mollie` | Mollie webhooks |

## WebSockets

| Path | Auth | Purpose |
|------|------|---------|
| `/ws/servers/:id/console` | Session or Bearer `gt_` | Live console |
| `/ws/servers/:id/players` | Session | Player list stream |
| `/ws/admin/logs/:source` | Admin session | API / daemon log tail |

Prefer REST for automation; use WS for interactive console.

## OpenAPI & route map

- [api-examples.md](api-examples.md) — **worked examples with outputs**
- [api-conventions.md](api-conventions.md) — shared rules
- [openapi.yaml](../openapi.yaml) — machine-readable paths
- [api-surface-map.md](api-surface-map.md) — source file index for developers

## Related docs

- [Client API (personal keys)](client-api.md)
- [Application API (machine keys)](application-api.md)
- [Auth & session internals](auth-and-session-internals.md)
- [Accounts & quotas](accounts-and-quotas.md)
- [Security](security.md)
