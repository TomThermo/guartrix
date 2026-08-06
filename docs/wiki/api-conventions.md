# API conventions

Shared rules for all Guartrix HTTP APIs (`/api/*`).

## Base URL

```
https://your-panel.example.com/api/…
```

On this operator host: `https://guartrix.com/api/…`

All examples below use:

```bash
export PANEL='https://guartrix.com'
export GT_KEY='gt_…'    # Client API
export GTA_KEY='gta_…'  # Application API
```

## Request format

| Rule | Value |
|------|--------|
| JSON bodies | `Content-Type: application/json` |
| File upload | `multipart/form-data` (`POST /api/servers/import`, file manager upload) |
| Query strings | Standard URL encoding (`?path=plugins%2FMyPlugin`) |
| HTTP methods | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |

### Authentication headers

**Client or Application API (scripts, CI, billing bridge):**

```http
Authorization: Bearer gt_…
```

**Browser session (panel UI or curl with cookie jar):**

```http
Cookie: sid=…
x-csrf-token: …        # required on POST/PUT/PATCH/DELETE
Origin: https://guartrix.com
```

Bearer requests **do not** need CSRF. Session requests **do** on mutating calls.

## Response format

### Success

- **200** — JSON body (most `GET` / `POST` that return data)
- **201** — Created (new server, user, backup, …)
- **204** — No body (delete, revoke key)

### Errors

Almost all errors return JSON:

```json
{ "error": "Human-readable message" }
```

Validation errors (`400`) may return Zod flatten:

```json
{
  "error": {
    "fieldErrors": { "port": ["Number must be greater than or equal to 1024"] },
    "formErrors": []
  }
}
```

| Status | When |
|--------|------|
| **400** | Invalid body / query |
| **401** | Not logged in / invalid Bearer token |
| **403** | Logged in but missing permission or admin scope |
| **404** | Resource not found (or server hidden from API key allow-list) |
| **409** | Conflict (port in use, server busy, username taken) |
| **429** | Rate limit (`API_KEY_RATE_LIMIT` / login limit) |
| **502** | Upstream daemon / version list failed |

### Rate limits

| Auth | Default limit | Env var |
|------|---------------|---------|
| Client API `gt_` | 120 / min / key | `API_KEY_RATE_LIMIT` |
| Application API `gta_` | 120 / min / key | `APPLICATION_API_RATE_LIMIT` |
| Cookie session | 600 / min / IP | (session rate limit) |

429 response:

```json
{ "error": "API key rate limit exceeded (120/min)" }
```

## IDs and types

| Field | Format | Example |
|-------|--------|---------|
| Server id | 12-char nanoid | `V1StGXR8_Z5j` |
| User id | 12-char nanoid | `abc123def456` |
| Server type | Enum string | `PAPER`, `FABRIC`, `BEDROCK` |
| Status | Enum string | `RUNNING`, `STOPPED`, `STARTING` |
| Timestamps | ISO 8601 UTC | `2026-08-06T08:15:00.000Z` |
| Memory / disk | Megabytes (integer) | `4096` = 4 GB |

## Pagination

Not all list endpoints paginate the same way:

| Endpoint | Pagination |
|----------|------------|
| `GET /api/admin/activity` | `?offset=0&limit=50` |
| `GET /api/application/activity` | `?offset=0&limit=50` |
| `GET /api/servers/:id/activity` | `?offset=0&limit=50` |
| `GET /api/servers` | No pagination — returns all visible servers |

Activity list response shape:

```json
{
  "total": 1240,
  "offset": 0,
  "limit": 50,
  "events": [ … ]
}
```

## Permission model (Client API)

Effective permission = **account access** ∩ **key permissions** ∩ **optional serverIds allow-list**.

- Owner / admin on server → account has full server perms before key filter.
- Subuser → only granted permission strings.
- Key with `["*"]` → all permissions the account already has on that server.
- Key with `serverIds: ["id1"]` → other servers return **404** (not 403).

See [Client API](client-api.md) and `GET /api/account/api-reference`.

## Related

- [API examples](api-examples.md) — copy-paste requests + sample JSON outputs
- [API overview](api-overview.md) — route map
- [OpenAPI](../openapi.yaml) — machine-readable schema
