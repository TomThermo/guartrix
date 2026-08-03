# Application API & Mollie billing

Guartrix separates **Client API** (`gt_…` personal keys) from the **Application
API** (`gta_…` machine keys) used by external billing panels / automation.
First-party checkout uses **Mollie**.

## Concepts

| Piece | Role |
|-------|------|
| **Plan template** | Quota preset + EUR price (cents): servers / RAM / databases; optional auto-create + Mollie interval |
| **Mollie checkout** | Logged-in user pays → webhook → quotas applied (and optional server / subscription) |
| **Mollie subscription** | Plans with `recurringInterval` use customer + `sequenceType: first`, then a Mollie subscription |
| **Application API** | Create users, raise quotas, create servers after an *external* payment |
| **Outbound webhook** | Optional `BILLING_WEBHOOK_URL` on paid / provisioned / subscription created / canceled / revoked |

New accounts still start at `DEFAULT_MAX_*=0`. Paying (or an admin / Application
API) raises quotas so they can create servers.

## Mollie setup

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

Webhook URL (must be reachable by Mollie; HTTPS in live mode):

`https://<PUBLIC_HOST>/api/public/billing/mollie`

Flow: create payment → customer pays on Mollie → webhook `id=tr_…` → panel
fetches payment → status `paid` → apply plan quotas once (idempotent).

If the plan has **auto-create server** enabled, the panel also creates a server
using `defaultMemoryMb` / `defaultDiskMb` / `defaultServerType` /
`defaultMcVersion` (free port on the selected node). Failures are recorded on
payment metadata and do not undo quotas.

If the plan has a **recurringInterval** (e.g. `1 month`), checkout creates a
Mollie customer (`User.mollieCustomerId`), a first payment with `sequenceType:
first`, then after paid a Mollie subscription starting one interval later.
Renewal webhooks create Payment rows and re-apply quotas. A **failed / expired /
canceled renewal** revokes quotas back to `DEFAULT_MAX_*`, suspends the local
subscription, and stops the user’s running servers. Users can **Cancel** an active
subscription from **Billing** (stops future Mollie renewals; does not immediately
revoke quotas).

After redirect back to `/account/billing?payment=…` the UI also **syncs** the
payment in case the webhook is delayed.

## Application API keys

**Admin → Billing → Application API keys**. Token prefix `gta_`, shown once.
Scopes: `users.read|write`, `servers.read|write`, `plans.read|write`,
`payments.read`, or `*`.

Rate limit: `APPLICATION_API_RATE_LIMIT` (default 120/min).

### Users

```http
GET  /api/application/users
POST /api/application/users
     Body: { "username", "password", "role"?, "maxServers"?, "maxMemoryMb"?, "maxDatabases"? }
PATCH /api/application/users/:id
Authorization: Bearer gta_…
```

### Servers

```http
GET  /api/application/servers
POST /api/application/servers
     Body: { "ownerId", "name", "type", "mcVersion", "port", "memoryMb", "nodeId"? }
```

Owner must already have quota (raise via PATCH user or Mollie provision).

### Plans & payments

```http
GET  /api/application/plans
POST /api/application/plans
GET  /api/application/payments
```

## Session / panel endpoints

| Method | Path | Who |
|--------|------|-----|
| GET | `/api/billing/plans` | Any logged-in user (enabled plans) |
| POST | `/api/billing/checkout` | Session — start Mollie payment |
| GET | `/api/billing/payments` | Own payments |
| POST | `/api/billing/payments/:id/sync` | Sync from Mollie after redirect |
| GET/POST/PATCH/DELETE | `/api/admin/plans` | Admin |
| GET | `/api/admin/payments` | Admin |
| GET/POST/DELETE | `/api/admin/application-keys` | Admin |

## Example: external panel after payment

```bash
export GTA='gta_…'
export PANEL='https://guartrix.com'

# Raise quotas for an existing user
curl -sS -X PATCH -H "Authorization: Bearer $GTA" -H "Content-Type: application/json" \
  -d '{"maxServers":1,"maxMemoryMb":4096,"maxDatabases":3}' \
  "$PANEL/api/application/users/USER_ID"

# Or create user + server
curl -sS -X POST -H "Authorization: Bearer $GTA" -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"……","maxServers":1,"maxMemoryMb":4096,"maxDatabases":1}' \
  "$PANEL/api/application/users"
```

## Security

- Never embed `gta_` keys in browser apps; server-side only.
- Prefer Mollie **test** keys until go-live.
- Recurring plans store `BillingSubscription` + `User.mollieCustomerId`.
- See also [Client API](client-api.md) and [Accounts & quotas](accounts-and-quotas.md).
