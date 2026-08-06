# Guartrix HTTP API overview

Guartrix exposes a **Fastify JSON API** on the same origin as the panel (`https://your-panel/api/…`).
The web UI proxies `/api` and `/ws` to the API process (default `127.0.0.1:3001`).

Use this page as the map; detail lives in the linked guides and in [OpenAPI](../openapi.yaml).

## Authentication types

| Type | Prefix | Who | Create keys | Typical use |
|------|--------|-----|-------------|-------------|
| **Browser session** | Cookie `sid` | Logged-in user | — | Panel UI |
| **Client API** | `gt_` | Any user | Account → Security → API keys | Scripts, CI, your own servers |
| **Application API** | `gta_` | Machine (admin) | Admin → Billing → Application API keys | WHMCS, custom billing, provisioning |
| **App password** | `gtap_` | SFTP only | Account → Security | FileZilla / SFTP — **not** HTTP |

```http
Authorization: Bearer gt_…
# or
Authorization: Bearer gta_…
```

- Bearer requests skip CSRF; cookie sessions need `Origin` + `x-csrf-token` on mutating calls.
- Client keys cannot create other keys (use a panel session for key management).
- Default rate limit: **120 requests / minute / key** (`API_KEY_RATE_LIMIT`).

## Quick start (Client API)

```bash
export PANEL='https://guartrix.com'
export GT_KEY='gt_…'

# Who am I + quotas
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/account" | jq

# My servers
curl -sS -H "Authorization: Bearer $GT_KEY" "$PANEL/api/servers" | jq '.[].name'

# Restart one server
curl -sS -X POST -H "Authorization: Bearer $GT_KEY" \
  "$PANEL/api/servers/SERVER_ID/restart"
```

Permission catalog (presets, scopes, all permission strings):

```http
GET /api/account/api-reference
```

No authentication required — use it when building key-creation UIs or docs.

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
| Profile & quotas | `/api/account`, `/api/auth/me` | [Client API](client-api.md) |
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
| `/ws/servers/:id/console` | Session (Bearer `gt_` planned) | Live console |
| `/ws/servers/:id/players` | Session | Player list stream |
| `/ws/admin/logs/:source` | Admin session | API / daemon log tail |

Prefer REST for automation; use WS for interactive console.

## OpenAPI & route map

- [openapi.yaml](../openapi.yaml) — machine-readable paths (Client + Application tags).
- [api-surface-map.md](api-surface-map.md) — source file index for developers.

## Related docs

- [Client API (personal keys)](client-api.md)
- [Application API (machine keys)](application-api.md)
- [Auth & session internals](auth-and-session-internals.md)
- [Accounts & quotas](accounts-and-quotas.md)
- [Security](security.md)
