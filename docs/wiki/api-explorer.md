# API explorer (interactive)

The panel hosts a **live API explorer** at **`/api-docs/explorer`** (dedicated API Reference — not the wiki):

- Pick an endpoint from the catalog
- Switch example language: **cURL · Node.js · Python · PHP · Ruby · Java · Go**
- **Copy** the snippet
- **Try it** — run the request from your browser against this panel

## How to use

1. Open **API → Explorer** (`/api-docs/explorer`)
2. Paste a Client key (`gt_…`) or Application key (`gta_…`) from Account → Security / Admin → Billing
3. For server routes, paste a **server ID** from `GET /api/servers`
4. Click **Try it** and inspect the live JSON response

Keys are stored only in browser `sessionStorage` for this tab session.

## Safety

- Endpoints marked **Safe to try** are read-only (GET / health / catalogs)
- **Mutating** actions (power, create, suspend, install addon, backup, rotate DB password) can change real servers — use a test key and confirm the body first

Catalog highlights: settings patch, files content, addons install/remove, backups create, allocations, connect/SFTP meta, databases, app-password minting, **session profile / email-available / password change**, Application provision/power/suspend.

## Related

- [API docs UI](api-docs-ui.md) — `/api-docs` product map
- [API overview](api-overview.md)
- [API examples](api-examples.md) — static curl + sample JSON
- [API conventions](api-conventions.md)
- [Client API](client-api.md)
- [Application API](application-api.md)
