# Environment variables

Copy `.env.example` → `.env` (repo root). Secrets must stay gitignored.

Daemon env file (token, MySQL root for game DBs, Docker knobs) — template: [`data/daemon.env.example`](../../data/daemon.env.example):

| Install type | Path |
|--------------|------|
| Local daemon on a full / panel+daemon install | `$INSTALL_DIR/data/daemon.env` (e.g. `/opt/guartrix/data/daemon.env`) |
| Remote **daemon-only** node (`install-daemon.sh` / Add node) | `/var/lib/guartrix/daemon.env` (override with `--data`) |

Editing the wrong path on a remote node has no effect — systemd loads `/var/lib/guartrix/daemon.env`.

Many operator knobs (public URL, SMTP, registration, quotas, 2FA policy, Turnstile, alerts, Cloudflare DNS, HTTPS flags) can also be managed in **Admin → Settings**, which stores overrides in `data/panel-settings.json` and may sync selected keys back into `.env` (restart needed for HTTPS / public URL). See [Panel settings](panel-settings.md).

## Core panel

| Variable | Purpose |
|----------|---------|
| `ADMIN_PASSWORD` | Bootstrap admin password (first boot only) |
| `HOST` | API bind (use `127.0.0.1` in production) |
| `API_PORT` | Default `3001` |
| `WEB_PORT` / `HTTPS_PORT` | Default `80` / `443` |
| `HTTPS_ENABLED` | `false` = HTTP-only / IP install (installer `--http`); `true` = TLS on `:443` |
| `SESSION_SECRET` | Long random string — also keys at-rest seals (TOTP secrets, game MySQL passwords, node-token vault) |
| `SESSION_SECURE` | `true` when serving over HTTPS; `false` for plain HTTP/IP |
| `TRUST_PROXY` | `true` behind Cloudflare / prod-web HTTPS; usually `false` for direct IP HTTP |
| `TRUSTED_PROXIES` | Peer IPs allowed to set `X-Forwarded-For` (default `127.0.0.1,::1`). `*` requires `ALLOW_INSECURE_TRUST_PROXY=1` |
| `ALLOW_INSECURE_TRUST_PROXY` | Must be `1`/`true` to allow `TRUSTED_PROXIES=*` (re-enables XFF spoofing) |
| `CSRF_ALLOW_MISSING_ORIGIN` | `1` allows cookie-auth mutating `/api` without Origin/Referer (default off — use Bearer keys for scripts) |
| `PUBLIC_HOST` | Canonical hostname or IP (also HTTPS redirect target when TLS on) |
| `PUBLIC_IP` | Public IP when useful for players/DNS |
| `PUBLIC_BASE_URL` | Full origin, e.g. `https://guartrix.com` or `http://203.0.113.10` |
| `DATA_DIR` | Default `./data` |
| `LOG_LEVEL` | API pino level (`fatal`…`trace`; default `info`) |
| `PRISMA_SLOW_MS` | When set (e.g. `200`), log Prisma queries slower than N ms |
| `METRICS_TOKEN` | `Authorization: Bearer` for Prometheus `GET /api/metrics` and daemon `/metrics` (no `?token=`). Unset = localhost only |
| `SENTRY_DSN` | Optional Sentry DSN for API + daemon (`@sentry/node`, tracesSampleRate `0.1`) |
| `VITE_SENTRY_DSN` | Optional Sentry DSN for web UI (`@sentry/react`, baked in at `vite build`) |
| `WEB_HOST` | Web bind address (default `0.0.0.0`) |
| `JAVA_PATH` | Host Java binary (fallback when not using the per-server Java picker) |
| `DOCKER_IMAGE` | Default `eclipse-temurin:25-jre-jammy` |
| `DOCKER_LOG_MAX_SIZE` | Docker `json-file` max-size for game containers (default `10m`; daemon env file) |
| `DOCKER_LOG_MAX_FILE` | Docker `json-file` max-file count (default `3`) |
| `DOCKER_SECCOMP_PROFILE` | Optional path to a Docker seccomp profile applied to game containers (daemon env file) |
| `DOCKER_NETWORK_MODE` | `per_server` (default: isolated `guartrix-s-<id>` per server; MySQL still on shared bridge) or `shared` (flat `guartrix` bridge; requires `ALLOW_SHARED_DOCKER_NETWORK=1`). Set on the daemon env file (local `data/daemon.env` or remote `/var/lib/guartrix/daemon.env`). New remote installs write `per_server`. |
| `ALLOW_SHARED_DOCKER_NETWORK` | Must be `1` on the daemon host to honour `DOCKER_NETWORK_MODE=shared` (ignored otherwise with a warning) |
| `MANAGE_FIREWALL` | Open/close game ports via ufw when true |

## Database (panel)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Prisma MySQL URL (optional pool params: `connection_limit`, `pool_timeout`, `connect_timeout`) |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | Same connection, split fields (installer / docs) |

Installer: `--mysql-docker` (default) or `--mysql-external` / `--database-url`.

**Full-panel Docker default:** one Docker container `guartrix-mysql` on `127.0.0.1:3306` holds the **panel** database *and* is reused by the local daemon for **per-server game DBs** (same volume `$INSTALL_DIR/data/mysql`). Recreating/wiping that volume deletes both. When the panel uses **external** MySQL already bound on localhost `:3306`, the installer sets game MySQL Docker to host port **`3307`** (`MYSQL_PORT` in `data/daemon.env`) to avoid the clash.

## Registration & mail

| Variable | Purpose |
|----------|---------|
| `REGISTRATION_ENABLED` | Open signup (default on) |
| `DEFAULT_MAX_SERVERS` | New-user server quota (default **0**) |
| `DEFAULT_MAX_MEMORY_MB` | New-user RAM quota (default **0**) |
| `DEFAULT_MAX_DATABASES` | New-user DB quota (default **0**) |
| `DEFAULT_BACKUP_KEEP_COUNT` | Default max backups kept for new servers (1–50, default **7**); overridable in Admin → Settings → Backup and Admin → Servers |
| `APP_NAME` | Panel product name in navbar / title (default Guartrix); also Admin → Settings → General |
| `APP_LOGO` / `APP_FAVICON` | Optional logo/favicon path or URL |
| `PANEL_DEBUG` | Operator debug banner (`1`/`true`) |
| `UNIT_PREFIX` | `binary` (default) or `decimal` for size labels |
| `NAVIGATION_TYPE` | `sidebar` / `topbar` / `mixed` (stored preference) |
| `DISPLAY_WIDTH` | `xl` / `2xl` / `full` content width |
| `MAIL_FROM` | Envelope From for outbound mail |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | SMTP relay (when unset, mail goes to `data/mail-outbox/`) |
| `SMTP_STARTTLS` | Force STARTTLS when not using implicit TLS (`SMTP_SECURE`) |
| `TWO_FACTOR_REQUIRED_ROLES` | Comma-separated roles that must enable TOTP (e.g. `ADMIN`). Empty = optional |
| `API_KEY_RATE_LIMIT` | Max Client API requests per minute per key (default **120**) |
| `APPLICATION_API_RATE_LIMIT` | Max Application API (`gta_`) requests per minute per key (default **120**) |
| `API_SESSION_RATE_LIMIT` | Max authenticated session (cookie) `/api` requests per minute **per userId** for non-poll traffic (default **600**; falls back to client IP only if the session has no `userId`) |
| `API_SESSION_READ_RATE_LIMIT` | Separate budget for dashboard poll GETs (`/api/servers`, `/stats`, `/online`, …) per userId (default **max(1800, 3× API_SESSION_RATE_LIMIT)**) so UI polls do not starve creates/power |
| `RATE_LIMIT_STORE` | `file` (default) under `data/rate-limits/`; `memory` in-process; `redis` shared (needs `REDIS_URL`) |
| `SESSION_STORE` | `file` (default, `data/sessions`) or `redis` (needs `REDIS_URL` + optional `ioredis`) |
| `REDIS_URL` | Redis URL for multi-API HA (sessions, rate limits, transfers, scheduler lock, backup busy lock, event bus, **BullMQ**) |
| `REDIS_ENABLED` | `0` disables Redis even if `REDIS_URL` is set; default on when URL is present |
| `JOBS_BULLMQ` | `1` (default) use BullMQ when Redis is configured; `0` force in-process scheduler |
| `JOBS_EMBEDDED` | `1` (default) run BullMQ workers inside the API process; `0` queues only (external worker later) |
| `REQUIRE_REDIS_HA` / `PANEL_HA` | `1` = managed HA: boot requires Redis connected + BullMQ + `SESSION_STORE=redis` + `RATE_LIMIT_STORE=redis`; Go-live treats missing alerts/attestations more strictly |
| `METRICS_TOKEN` | When set, `GET /api/metrics` requires `Authorization: Bearer …` |
| `TRANSFER_ALLOW_PANEL_STAGING` | `0` (default) peer-only node transfer; `1` allows panel tmpdisk fallback when peer copy fails |
| `API_OWNER_RATE_LIMIT` | Aggregate Client API + cookie session requests/min per owning userId (default **1800**; `0` disables) |
| `SCHEDULER_LOCK_TTL_MS` | Redis scheduler lock TTL (default 15000). With Redis configured, lock acquisition **fail-closed** on Redis errors |
| `SCHEDULER_LOCK_TTL_MS` | Redis leader-lock TTL for backup/schedule ticks (default **15000**) |
| `BACKUP_BUSY_TTL_MS` | Redis TTL for per-server backup/restore busy lock (default **7200000** = 2h; clamp 1m–24h). Without Redis, lock is process-local. |
| `DAEMON_BRIDGE_RECONNECT_BASE_MS` | Exp backoff base for daemon `/events` reconnect (default **1000**) |
| `DAEMON_BRIDGE_RECONNECT_MAX_MS` | Exp backoff cap (default **60000**) |
| `DAEMON_BRIDGE_RECONNECT_JITTER_MS` | Full jitter added to reconnect delay (default **1000**) |
| `DAEMON_BRIDGE_CONNECT_STAGGER_MS` | Max stagger window for first connect / leadership gain (default **10000**; `0` = no stagger) |
| `DAEMON_BRIDGE_LOCK_TTL_MS` | Redis leader-lock TTL for who opens `/events` bridges (default **15000**). Renewed on the 15s refresh tick. |
| `DAEMON_BRIDGE_MODE` | `auto` (default): bridge always without Redis, else only lock leader; `always` / `never` for debug |
| `CSP_REPORT_ONLY` | `1` = prod-web also sends CSP Report-Only (stricter `style-src 'self'`) for violation telemetry |
| `CSP_SCRIPT_SRC_EXTRA` | Extra `script-src` tokens (space-separated hosts/hashes) appended to the enforcing CSP |
| `CSP_ALLOW_UNSAFE_INLINE_SCRIPT` | `1` = allow `'unsafe-inline'` in `script-src` (last resort; browsers ignore it when a nonce is present). Prefer disabling Cloudflare Email Obfuscation / fixing injects instead |
| `RELEASE_OBFUSCATE` | `0` = skip javascript-obfuscator on api/daemon release `dist` (default on). GitHub `src/` is never obfuscated |
| `MOLLIE_API_KEY` | Mollie Payments API key (`test_…` / `live_…`); enables checkout |
| `MOLLIE_WEBHOOK_IP_ALLOWLIST` | Optional comma/space-separated source IPs for `POST /api/public/billing/mollie` (empty = allow all). Refresh from `curl https://ip-ranges.mollie.com/ips.txt` (Mollie IPs change over time) |
| `BILLING_WEBHOOK_URL` | Optional outbound JSON webhook on payment paid / provisioned / subscription events |
| `CURSEFORGE_API_KEY` | Optional CurseForge API key for Modpacks tab search/install |
| `LICENSE_SERVER_URL` | Panel: license API URL. Default `https://license.guartrix.com` (or `https://license.<PUBLIC_HOST>` when `PUBLIC_HOST` is a real domain and the var is unset) |
| `SKIP_LOCAL_DAEMON` | Panel: `1` = no local daemon / local node (panel-only install; use remote nodes) |
| `LICENSE_KEY` | Panel license key |
| `LICENSE_INSTALL_ID` | Optional stable install id (else auto-file in `data/`) |
| `LICENSE_VERIFY_PUBLIC_KEY` | Optional Ed25519 public PEM override; else `data/licenses/signing-public.pem` (auto-seeded from baked-in Guartrix key if missing) |
| `LICENSE_ALLOW_UNSIGNED` | `1` = accept unsigned validate JSON (insecure; migration only) |
| `LICENSE_UNREACHABLE_GRACE_MS` | Soft-valid window if license host unreachable (default `43200000` = 12h); also used by daemons for ticket grace |
| `LICENSE_VALIDATE_INTERVAL_MS` | How often the panel calls `/v1/validate` in the background (default `600000` = 10m) |
| `LICENSE_VALIDATE_FAIL_ALERTS` | Activity alert after N consecutive validate transport/signature failures (default `3`) |

The license **server** is hosted separately by Guartrix (default `https://license.guartrix.com`). Panel installs only need `LICENSE_SERVER_URL` and `LICENSE_KEY`. Without a valid key the panel runs the [free tier](licensing.md#free-tier-no-valid-license) (1 node, 1 server, 10 GB disk).

## Nodes & SFTP

| Variable | Purpose |
|----------|---------|
| `DAEMON_HOST` / `DAEMON_PORT` | Local daemon bind (loopback) |
| `DAEMON_PUBLIC_HOST` | Hostname prod-web routes to the local daemon (e.g. `node1.guartrix.com`). Empty = disabled |
| `DAEMON_PROXY_HOST` / `DAEMON_PROXY_PORT` | Upstream for that host (default `127.0.0.1:$DAEMON_PORT`) |
| `DAEMON_TLS_CERT_FILE` / `DAEMON_TLS_KEY_FILE` | Optional SNI cert for the daemon host (default Let’s Encrypt `node1.$PUBLIC_HOST`) |
| `DAEMON_TOKEN` | Optional override; else the daemon env file (HMAC secret + legacy bearer) |
| `DAEMON_NODE_ID` | Panel node id (written into `daemon.env`; JWT `nid` claim) |
| `DAEMON_JWT_TTL` | Access JWT lifetime seconds (default `900`) |
| `DAEMON_JWT_WS_TTL` | WebSocket JWT lifetime seconds (default `3600`) |
| `DAEMON_JWT_LEGACY` | `false` (default) = JWT only; `true` temporarily for old daemons (deprecated — logs a warning when used; remove after all nodes use JWT) |
| `DAEMON_RATE_LIMIT_MAX` | Max daemon HTTP requests per IP per window (default **600**; daemon env file) |
| `DAEMON_RATE_LIMIT_WINDOW_MS` | Daemon rate-limit window in ms (default **60000**) |
| `EXTRA_MOUNTS_ALLOW_PREFIX` | Comma-separated host path prefixes allowed for server extra mounts (default `/var/lib/guartrix/shared,/opt/guartrix/shared`). Changing mounts requires **ADMIN** |
| `DISK_USAGE_CACHE_MS` | Stale-while-revalidate TTL for per-server disk walks on the node (default **30000**; clamp 1s–10m; daemon/node-agent) |
| `DISK_WATCH_INTERVAL_MS` | Panel interval for disk-quota high alerts (default **300000** = 5m; clamp 30s–1h) |
| `DISK_WATCH_PAGE_SIZE` | Servers per disk-watch page (default **100**; clamp 10–500) |
| `DISK_WATCH_CONCURRENCY` | Parallel `daemonDisk` probes per page (default **8**; clamp 1–32) |
| `SCHEDULER_TASK_BATCH` | Max due scheduled tasks per 60s tick (default **50**) |
| `SCHEDULER_BACKUP_BATCH` | Max due backup schedules per 60s tick (default **50**) |
| `ADMIN_STATUS_CACHE_MS` | Admin Status response cache TTL (default **10000**; `?refresh=1` bypass) |
| `ADMIN_STATUS_NODE_CONCURRENCY` | Parallel daemon status probes (default **8**) |
| `SERVER_LIST_FS_CACHE_MS` | TTL for cached `hasIcon` / `whitelistEnabled` when serializing server lists (default **15000**; clamp 1s–2m) |
| `SFTP_PORT` / `SFTP_ENABLED` | Embedded SFTP per node |
| `PANEL_URL` | URL the daemon uses for SFTP password checks |
| `GUARTRIX_REPO_URL` | Git URL for remote install scripts |
| `GUARTRIX_SERVER_ID` / `GUARTRIX_TOTP_FROM_DB` / `GUARTRIX_TOTP_SECRET` / `GUARTRIX_TOTP` | Docs host only — wiki screenshot capture (`scripts/capture-wiki-screenshots.mjs`); not used by panel runtime |
| `MYSQL_PORT` / `MYSQL_IMAGE` | Per-node game MySQL container |
| `MYSQL_ROOT_PASSWORD` | Root password for the node game-MySQL container (daemon env — never commit) |
| `MYSQL_PUBLIC_HOST` | Hostname plugins use for game MySQL (default Docker DNS `guartrix-mysql`) |
| `GUARTRIX_DEMO_SERVER_NAME` | Optional demo/bootstrap server display name (installer / docs demos) |
| `GUARTRIX_BASE_URL` | Docs/demo helper base URL (screenshot tooling; not required for panel runtime) |

## Cloudflare / TLS (optional)

| Variable | Purpose |
|----------|---------|
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_DOMAIN` | Auto A/SRV records (token: Zone DNS Edit on one zone — see [security.md](security.md)) |
| `TURNSTILE_ENABLED` / `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile bot check on login/register (prefer **Admin → Security**; both keys required when enabled) |
| `ALLOW_INSECURE_DEFAULTS` | Set `1` only for local dev — otherwise API refuses default `SESSION_SECRET` / `ADMIN_PASSWORD` |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | Override Origin cert paths (panel behind Cloudflare) |
| `DAEMON_TLS_CERT_FILE` / `DAEMON_TLS_KEY_FILE` | SNI cert for DNS-only `node1.*` / `DAEMON_PUBLIC_HOST` (LE by default) |
| `DOWNLOAD_PUBLIC_HOST` | DNS-only hostname for password `/download` (e.g. `download.guartrix.com`); apex `/download` redirects here |
| `DOWNLOAD_TLS_CERT_FILE` / `DOWNLOAD_TLS_KEY_FILE` | SNI cert for `DOWNLOAD_PUBLIC_HOST` (LE by default) |
| `LETSENCRYPT_EMAIL` | Email for `install-daemon-le-cert.sh` / `install-download-le-cert.sh` |
| `DOWNLOAD_PASSWORD` | Enables password gate on `/download` (release zip) |
| `DOWNLOAD_ENABLED` | Set `0` to disable even if password is set |
| `DOWNLOAD_DIR` | Zip publish dir (default `data/downloads`) |
| `DOWNLOAD_SESSION_TTL_SEC` | Cookie lifetime after unlock (default 7 days) |
| `DOWNLOAD_COOKIE_SECRET` | Optional HMAC secret (else `SESSION_SECRET`) |

## Activity log & alerts

| Variable | Purpose |
|----------|---------|
| `ACTIVITY_LOG_RETENTION_DAYS` | Days of activity history to keep (default **90**, `0` = forever) |
| `ACTIVITY_WEBHOOK_URL` | Webhook for critical events; Discord URLs get embeds, others a generic JSON POST (SSRF-safe via DNS-pinned `fetchSafeWebhook`) |
| `BILLING_WEBHOOK_URL` | Optional outbound JSON webhook for billing events (same SSRF-safe fetch helper) |
| `ALERT_EMAIL` | Address that also receives critical-event mail (needs `SMTP_*`) |
| `VAPID_PUBLIC_KEY` | Web Push public key (Account → Security opt-in; `npx web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | Web Push private key (keep secret) |
| `VAPID_SUBJECT` | `mailto:` contact for VAPID (default `mailto:noreply@$PUBLIC_HOST`) |
| `ACTIVITY_ALERT_MUTE` | Comma-separated action keys to never alert on, e.g. `auth.login-failed` |
| `BACKUP_OFFSITE_CMD` | Optional shell command after each backup (`{path}` `{serverId}` `{backupId}` `{fileName}`). Also editable in **Admin → Settings → Alerts** |
| `BACKUP_ENCRYPTION` | `1` = seal new backups with AES-256-GCM (`.tar.gz.enc`) |
| `BACKUP_ENCRYPTION_KEY` | Optional passphrase / 64-hex / base64-32 key (else derived from `SESSION_SECRET`) |

See [Activity log](activity-log.md) for the event list and payload format.

## Watchdog

| Variable | Purpose |
|----------|---------|
| `NO_MONITOR` | `1` disables `scripts/monitor.sh` |
| `MONITOR_INTERVAL` | Seconds between checks (default `20`) |
| `MONITOR_MAX_RESTARTS` | Restarts within the window before backing off (default `6`) |
| `MONITOR_BACKOFF` | Cool-down seconds after hitting the restart cap (default `300`) |
| `BOOT_START_STAGGER_MS` | Delay between auto-start servers after reboot |

See `.env.example` for the full commented template.
