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
- [x] Email verification before linking pending subuser invites **and** before invite accept (`emailVerified`)
- [x] When `SMTP_HOST` is set: verify-before-login for non-admin accounts
- [x] Admin → Settings → **Go-live** readiness checks (`GET /api/admin/readiness`)
- [x] Registration quotas default to **0** until an admin grants capacity
- [ ] `ACTIVITY_WEBHOOK_URL` / `ALERT_EMAIL` set so crashes and failed sign-ins are noticed — **per customer install** via Admin → Settings or `.env` (optional on the download/build host)
- [x] Consider `TWO_FACTOR_REQUIRED_ROLES=ADMIN` so panel admins must use TOTP
- [x] Optional Cloudflare Turnstile on login / register (**Admin → Settings → Security**)
- [x] Login rate limits use client IP only from **trusted proxies** (`TRUSTED_PROXIES`, default localhost)
- [x] `TRUSTED_PROXIES=*` refused unless `ALLOW_INSECURE_TRUST_PROXY=1`
- [x] Watchdog posts to `ACTIVITY_WEBHOOK_URL` on panel restart / critical backoff
- [x] Public `/download` on DNS-only host (`DOWNLOAD_PUBLIC_HOST`) to avoid Cloudflare bot challenges
- [x] Outbound webhook / download URLs blocked from private IPs; Discord status HTTPS-only
- [x] Refuse weak default `SESSION_SECRET` / `ADMIN_PASSWORD` unless `ALLOW_INSECURE_DEFAULTS=1`

## Built-in controls (V0.2+)

| Area | Control |
|------|---------|
| Proxy | `X-Forwarded-*` overwritten from the socket by prod-web; API trusts XFF only from `TRUSTED_PROXIES` |
| CSP | prod-web sends `script-src` with a **per-request nonce** (stamped on `index.html` scripts). Allows `https://challenges.cloudflare.com` for Turnstile and `static.cloudflareinsights.com` for Web Analytics. Prefer turning off **Email Address Obfuscation** (Scrape Shield) rather than `'unsafe-inline'` |
| CSRF | Origin/Referer + **`x-csrf-token`** double-submit on authenticated cookie mutating `/api` (missing Origin **and** Referer rejected unless `CSRF_ALLOW_MISSING_ORIGIN=1`; Bearer-only `gt_`/`gta_` skip CSRF; **cookie session always enforces CSRF** even if a Bearer also resolved; `/api/public/*` exempt; token compare uses **`timingSafeEqual`**) |
| Sessions | `httpOnly` + `SameSite=Lax`; regenerate on login; purge on password reset |
| Rate limits | Login / API-key / SFTP counters via `RATE_LIMIT_STORE` (`file` default under `data/rate-limits/`, or `memory`); authenticated session `/api` capped by `API_SESSION_RATE_LIMIT` (default 600/min **per userId**, IP fallback only if session has no user); owner aggregate `API_OWNER_RATE_LIMIT` (default 1800/min across session + Client API keys); panel-password step-up (`verifyAccountPassword`) capped 10/15min per user (delete server, app passwords, 2FA disable/recovery, account delete) |
| Auth timing | Login and SFTP always run one scrypt verify (precomputed dummy hash for unknown users) |
| Billing redirects | Mollie `redirectUrl` must stay on this panel’s `/account/billing` origin — other hosts ignored |
| Passwords | Versioned scrypt hashes (`scrypt$v1$…`); legacy `salt:hash` still verifies and upgrades on login |
| Secrets at rest | TOTP secrets, game MySQL `Database.password`, and optional backups (`BACKUP_ENCRYPTION=1` → `.tar.gz.enc` AES-256-GCM) sealed with purpose salts from `SESSION_SECRET` / `BACKUP_ENCRYPTION_KEY`; legacy plaintext passwords accepted and re-sealed on read/write |
| 2FA | Optional TOTP + recovery codes; role-required via `TWO_FACTOR_REQUIRED_ROLES` — enrollment gate for cookie sessions ignores junk `Authorization: Bearer` (same as CSRF); `gt_` keys still require enrolled TOTP for those roles — see [Accounts & quotas](accounts-and-quotas.md) |
| Turnstile | Optional Cloudflare Turnstile on login/register — **Admin → Settings → Security** (or `TURNSTILE_*` env); server verifies via siteverify before credentials / account create |
| Client API | Personal Bearer keys (`gt_…`), scoped permissions + **adminScopes** enforced per route; **ADMIN create/promote** needs `admin.full`/`*`; Application mint/promote ADMIN needs Application scope `*`; Application password changes revoke sessions — see [Client API](client-api.md) |
| Admin lockout | Last `ADMIN` cannot be deleted or demoted (panel + Application API) |
| Files / SFTP | Symlink jail, `O_NOFOLLOW` uploads, member-safe archive extract, sensitive `guartrix-*.json` blocked |
| Archives | Symlinks/hardlinks rejected; zip member-by-member; File Manager + modpack/clone/import use `safeExtractArchive` |
| Daemon | Short-lived HS256 JWTs on the wire (HMAC with node secret); raw bearer only if `DAEMON_JWT_LEGACY=true`; `serverId` sanitized; MySQL game users **reject `remote: %`** (private patterns only, default `172.%`; delete may still drop legacy `%` grants); MySQL client uses **`--defaults-extra-file`** (root password not on argv); containers `--cap-drop=ALL`; optional **`DOCKER_SECCOMP_PROFILE`**; per-IP HTTP rate limit (`DAEMON_RATE_LIMIT_MAX`, default 600/min); **`DOCKER_NETWORK_MODE=per_server`** (default) isolates game bridges (`guartrix-s-<id>`) with a second attach to shared `guartrix` for game MySQL; **`shared`** requires `ALLOW_SHARED_DOCKER_NETWORK=1`; daemon port ufw restricted to panel IP when `MANAGE_FIREWALL` + `PANEL_URL` |
| Outbound | Webhook/download SSRF guards (`safe-url.ts`); CDN host allowlist for jars/modpacks; fetches **DNS-pin** to pre-validated public IPs (anti rebinding) |
| Capacity | Shared `assertNodeCapacity` (incl. reserve) on create/PATCH |
| Nodes | Only admins pick `nodeId` on create / clone / import; **extraMounts** admin-only (same bar as memory/disk); remote-install verifies SSH host keys (explicit trust + stored fingerprint; replace requires confirm) **and requires panel password step-up**; install script prefers ufw allow daemon port **from panel IP only** |
| Invites | No temporary password in JSON — setup link emailed; accept links are hashed tokens with a 7-day TTL; public peek hides email/server until signed in |
| Audit | Activity log records actor + IP per action; secret-looking metadata keys dropped — see [Activity log](activity-log.md) |
| Watchdog | Restarts unhealthy panel processes; Discord/webhook alert when `ACTIVITY_WEBHOOK_URL` is set |
| Licensing | Signed validate, IP/install bind, rate limits, feature ceilings — see [Licensing](licensing.md) |

Internal security references:

- [Auth and session internals](auth-and-session-internals.md)
- [Daemon API](daemon-api.md)
- [Node-agent internals](node-agent-internals.md)
- [Shared contracts](shared-contracts.md)
- [License flow internals](license-flow-internals.md)

## Secret rotation runbook

Rotate these in order when a secret may have leaked:

1. **`SESSION_SECRET`** — generate a new long random value in `.env`.  
   This secret keys the encrypted node-token vault (`data/node-tokens.json`), sealed TOTP secrets, and sealed game MySQL passwords (`Database.password`). After changing it, regenerate daemon tokens for every node (System → node → reinstall / rotate token) and update remote `daemon.env`. Existing sealed TOTP / DB passwords become unreadable until re-enrolled or passwords are rotated — prefer rotating game DB passwords from the panel after a secret change. Restart with `bash scripts/start.sh`.
2. **Daemon bearer (`DAEMON_TOKEN` / per-node tokens)** — rotate via the panel (new token → update the daemon env file: local `$INSTALL_DIR/data/daemon.env`, remote `/var/lib/guartrix/daemon.env`). Old hash on `Node.tokenHash` is replaced; restart daemon.
3. **MySQL passwords** — panel DB (`MYSQL_PASSWORD` / `DATABASE_URL`) and game MySQL root in the daemon env file. On a **full Docker** install these often share one `guartrix-mysql` volume — rotating/recreating carefully. Update env, restart, and recreate game DB users if needed. Game-server DB user passwords in the panel are stored sealed; recreate those databases (or change passwords on the node MySQL) after a `SESSION_SECRET` change.
4. **Application / Client API keys** — revoke compromised `gta_` / `gt_` keys in Admin → Billing / Security; issue new ones.
5. **Mollie / Cloudflare / SMTP / Turnstile** — rotate at the provider console, then update Admin → Settings or `.env`.
6. **TLS private key** — replace `cert/*.key` (or `TLS_KEY_FILE`) and reload web.

Never commit rotated secrets. Prefer `ACTIVITY_WEBHOOK_URL` so failed logins and crashes are noticed during rotation windows.

## Periodic review (symlink / archives / CSRF)

Re-check after upgrades:

- File Manager + SFTP resolve paths under the server jail; symlinks and `guartrix-*.json` stay blocked.
- Zip/tar extract rejects symlink members.
- Cookie mutating routes require matching Origin/Referer **and** session `x-csrf-token` when authenticated (Bearer and `/api/public/*` exempt). Missing Origin **and** Referer is rejected unless `CSRF_ALLOW_MISSING_ORIGIN=1`.
- Public invite peek returns a masked `emailHint` only; full invite email requires a signed-in session.
- Mollie webhook is rate-limited and only syncs `tr_*` ids that exist in the local Payment table.

Daemon short-lived JWT rotation is implemented (panel signs HS256 JWTs; `DAEMON_TOKEN` stays the shared secret). Raw bearer is off by default (`DAEMON_JWT_LEGACY=false`).

## Docker network isolation

On game nodes, **`DOCKER_NETWORK_MODE=per_server`** (default) gives each server its own
`guartrix-s-<id>` bridge so containers cannot reach sibling servers on the game network.
MySQL still runs on the shared `guartrix` bridge; the daemon attaches each game container
to **both** networks so `guartrix-mysql` DNS keeps working.

For **single-tenant** hosts or the simplest shared DNS setup, set
`DOCKER_NETWORK_MODE=shared` in the daemon env file. Restart the daemon and recreate
containers after changing the mode. Details:
[Install nodes — Docker networks](install-nodes.md#docker-networks).

## Remote install SSH host keys

The Add-node wizard verifies the VPS SSH host key:

1. First connection presents the fingerprint and **rejects** until the admin confirms **Trust host key**.
2. The fingerprint is stored on `Node.sshHostKeyFingerprint`.
3. Later installs must match; after a VPS rebuild, use **Replace host key**.
4. Remote install also requires the admin’s **panel password** (step-up) so a stolen cookie session alone cannot root a VPS.

`install-daemon.sh` prefers opening the daemon port **only from the panel IP** (resolved from `PANEL_URL`) when ufw is available.

## Install script supply chain (residual risk)

Remote node install (`scripts/install-daemon.sh` and the panel wizard) may run
`curl | sh` against [get.docker.com](https://get.docker.com/) and
[NodeSource setup](https://github.com/nodesource/distributions) when Docker / Node 22
are missing. That is convenient but not fully pinned — treat it as a **residual risk**
on production VPS hosts.

### Preseed checklist (preferred)

On each new node **before** running the Guartrix installer:

1. Install **Docker Engine** from the vendor’s package repo (pin a CE version; verify apt/yum signatures).
2. Install **Node.js 22.x** from a pinned NodeSource or distro package (verify `node -v` ≥ 22).
3. Confirm both are on `PATH` (`command -v docker`, `command -v node`).
4. Run `install-daemon.sh` / Add-node wizard — the script **skips** curl|sh when tools already exist.
5. Prefer a **tagged Guartrix release** branch for `--repo` / `--branch`.
6. Keep daemon firewall **panel-IP only** via `PANEL_URL` + ufw.

When you cannot preseed, pin versions and checksums per vendor docs — do not re-run
unpinned `curl | sh` on every redeploy.

Full notes: [Install nodes — supply chain](install-nodes.md#install-script-supply-chain-residual-risk).

## Daemon JWT defaults (mitigation)

Panel→daemon auth uses short-lived HS256 JWTs signed with `DAEMON_TOKEN`:

| Knob | Default | Purpose |
|------|---------|---------|
| `DAEMON_JWT_TTL` | `900` | HTTP access JWT lifetime (seconds) |
| `DAEMON_JWT_WS_TTL` | `3600` | WebSocket JWT lifetime |
| `DAEMON_JWT_LEGACY` | `false` | When `true`, also accept raw long-lived bearer (deprecated) |

Keep **`DAEMON_JWT_LEGACY=false`** on all nodes after migration. Rotate node tokens from
**System → Nodes** (or Admin Status) if a token may have leaked. TLS on the daemon
public URL remains required for production.

A stolen valid JWT or token still grants **full node** access — that residual is inherent
to the Wings-style model; mitigations shorten the window and remove legacy bearer.

Outbound webhooks (`ACTIVITY_WEBHOOK_URL`, `BILLING_WEBHOOK_URL`, per-server owner
webhooks) go through **DNS-pinned** `fetchSafeWebhook` / `assertSafeOutboundUrl` so
SSRF to loopback/link-local/metadata is rejected.

Treat this panel like production hosting software: rotate any secrets that appear in chat or tickets, and keep the OS and Docker patched.

For alert delivery paths and event sinks, see [Notifications and alerts](notifications-and-alerts.md).
