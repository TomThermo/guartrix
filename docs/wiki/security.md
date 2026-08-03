# Security

## Cloudflare DNS token (least privilege)

When using `CLOUDFLARE_API_TOKEN` for Minecraft A/SRV records and/or Let's Encrypt
DNS-01 (`install-*-le-cert.sh`):

1. Create an **API Token** (not Global API Key).
2. Permissions: **Zone → DNS → Edit** only.
3. Zone resources: **Include → Specific zone → your panel domain**.
4. Do **not** grant Zone Settings, User Admin, or Account-wide DNS.
5. Optional: use a **separate** token for certbot DNS-01 vs panel live DNS if you
   want to rotate them independently.

`CLOUDFLARE_ACCOUNT_ID` is unused by the DNS code today — leave it blank unless
another tool on the host needs it.

## Checklist

- [x] Never commit `.env`, `data/`, or `cert/*.key`
- [x] API and local daemon bound to localhost; only 80/443/2022/game ports public
- [x] Long random `SESSION_SECRET`; `SESSION_SECURE=true` + `TRUST_PROXY=true` behind HTTPS
- [x] HTTPS redirect Host pinned to `PUBLIC_HOST` (no client `Host` open redirect)
- [x] Cleartext WebSocket on `:80` rejected when HTTPS is enabled
- [x] Strong passwords enforced on register / reset / admin create
- [x] Email verification before linking pending subuser invites (requires `emailVerified`)
- [x] When `SMTP_HOST` is set: verify-before-login for non-admin accounts
- [x] Registration quotas default to **0** until an admin grants capacity
- [ ] `ACTIVITY_WEBHOOK_URL` / `ALERT_EMAIL` set so crashes and failed sign-ins are noticed (optional per install)
- [x] Consider `TWO_FACTOR_REQUIRED_ROLES=ADMIN` so panel admins must use TOTP
- [x] Login rate limits use client IP only from **trusted proxies** (`TRUSTED_PROXIES`, default localhost)
- [x] Watchdog posts to `ACTIVITY_WEBHOOK_URL` on panel restart / critical backoff
- [x] Public `/download` on DNS-only host (`DOWNLOAD_PUBLIC_HOST`) to avoid Cloudflare bot challenges
- [x] Outbound webhook / download URLs blocked from private IPs; Discord status HTTPS-only
- [x] Refuse weak default `SESSION_SECRET` / `ADMIN_PASSWORD` unless `ALLOW_INSECURE_DEFAULTS=1`

## Built-in controls (V0.2+)

| Area | Control |
|------|---------|
| Proxy | `X-Forwarded-*` overwritten from the socket by prod-web; API trusts XFF only from `TRUSTED_PROXIES` |
| CSRF | Origin/Referer check on cookie-auth mutating `/api` routes |
| Sessions | `httpOnly` + `SameSite=Lax`; regenerate on login; purge on password reset |
| Rate limits | Login / API-key / SFTP counters via `RATE_LIMIT_STORE` (`file` default under `data/rate-limits/`, or `memory`) |
| Passwords | Versioned scrypt hashes (`scrypt$v1$…`); legacy `salt:hash` still verifies and upgrades on login |
| Secrets at rest | TOTP secrets, game MySQL `Database.password`, and optional backups (`BACKUP_ENCRYPTION=1` → `.tar.gz.enc` AES-256-GCM) sealed with purpose salts from `SESSION_SECRET` / `BACKUP_ENCRYPTION_KEY`; legacy plaintext passwords accepted and re-sealed on read/write |
| 2FA | Optional TOTP + recovery codes; role-required via `TWO_FACTOR_REQUIRED_ROLES` — see [Accounts & quotas](accounts-and-quotas.md) |
| Client API | Personal Bearer keys (`gt_…`), scoped permissions, per-key rate limit — see [Client API](client-api.md) |
| Files / SFTP | Symlink jail, `O_NOFOLLOW` uploads, member-safe archive extract, sensitive `guartrix-*.json` blocked |
| Archives | Symlinks/hardlinks rejected; zip extracted member-by-member |
| Daemon | Short-lived HS256 JWTs on the wire (HMAC with node secret); raw bearer only if `DAEMON_JWT_LEGACY=true`; `serverId` sanitized; MySQL game users default `remote: 172.%`; containers `--cap-drop=ALL` |
| Outbound | Webhook/download SSRF guards (`safe-url.ts`); CDN host allowlist for jars/modpacks |
| Capacity | Shared `assertNodeCapacity` (incl. reserve) on create/PATCH |
| Nodes | Only admins pick `nodeId` on create / clone / import |
| Invites | No temporary password in JSON — setup link emailed; accept links are hashed tokens with a 7-day TTL |
| Audit | Activity log records actor + IP per action; secret-looking metadata keys dropped — see [Activity log](activity-log.md) |
| Watchdog | Restarts unhealthy panel processes; Discord/webhook alert when `ACTIVITY_WEBHOOK_URL` is set |
| Licensing | Signed validate, IP/install bind, rate limits, feature ceilings — see [Licensing](licensing.md) |

## Secret rotation runbook

Rotate these in order when a secret may have leaked:

1. **`SESSION_SECRET`** — generate a new long random value in `.env`.  
   This secret keys the encrypted node-token vault (`data/node-tokens.json`), sealed TOTP secrets, and sealed game MySQL passwords (`Database.password`). After changing it, regenerate daemon tokens for every node (System → node → reinstall / rotate token) and update remote `daemon.env`. Existing sealed TOTP / DB passwords become unreadable until re-enrolled or passwords are rotated — prefer rotating game DB passwords from the panel after a secret change. Restart with `bash scripts/start.sh`.
2. **Daemon bearer (`DAEMON_TOKEN` / per-node tokens)** — rotate via the panel (new token → update `data/daemon.env` or remote install). Old hash on `Node.tokenHash` is replaced; restart daemon.
3. **MySQL passwords** — panel DB (`MYSQL_PASSWORD` / `DATABASE_URL`) and game MySQL root in `data/daemon.env`. Update env, restart, and recreate game DB users if needed. Game-server DB user passwords in the panel are stored sealed; recreate those databases (or change passwords on the node MySQL) after a `SESSION_SECRET` change.
4. **Application / Client API keys** — revoke compromised `gta_` / `gt_` keys in Admin → Billing / Security; issue new ones.
5. **Mollie / Cloudflare / SMTP** — rotate at the provider console, then update `.env`.
6. **TLS private key** — replace `cert/*.key` (or `TLS_KEY_FILE`) and reload web.

Never commit rotated secrets. Prefer `ACTIVITY_WEBHOOK_URL` so failed logins and crashes are noticed during rotation windows.

## Periodic review (symlink / archives / CSRF)

Re-check after upgrades:

- File Manager + SFTP resolve paths under the server jail; symlinks and `guartrix-*.json` stay blocked.
- Zip/tar extract rejects symlink members.
- Cookie mutating routes still fail without a matching Origin/Referer (Bearer and `/api/public/*` exempt).
- `TRUST_PROXY` + `TRUSTED_PROXIES` still match your edge (default localhost via prod-web).

Daemon short-lived JWT rotation is implemented (panel signs HS256 JWTs; `DAEMON_TOKEN` stays the shared secret). Raw bearer is off by default (`DAEMON_JWT_LEGACY=false`).

## Reporting

Treat this panel like production hosting software: rotate any secrets that appear in chat or tickets, and keep the OS and Docker patched.
