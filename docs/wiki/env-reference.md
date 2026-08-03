# Environment variables

Copy `.env.example` → `.env` (repo root). Secrets must stay gitignored. The local daemon also reads `data/daemon.env` (generated/updated by start scripts; template: [`data/daemon.env.example`](../../data/daemon.env.example)).

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
| `TRUSTED_PROXIES` | Peer IPs allowed to set `X-Forwarded-For` (default `127.0.0.1,::1`). Use `*` only if every hop is trusted |
| `PUBLIC_HOST` | Canonical hostname or IP (also HTTPS redirect target when TLS on) |
| `PUBLIC_IP` | Public IP when useful for players/DNS |
| `PUBLIC_BASE_URL` | Full origin, e.g. `https://guartrix.com` or `http://203.0.113.10` |
| `DATA_DIR` | Default `./data` |
| `LOG_LEVEL` | API pino level (`fatal`…`trace`; default `info`) |
| `PRISMA_SLOW_MS` | When set (e.g. `200`), log Prisma queries slower than N ms |
| `METRICS_TOKEN` | Bearer/`?token=` for Prometheus `GET /api/metrics` and `/metrics` (API + daemon). Unset = localhost only |
| `SENTRY_DSN` | Optional Sentry DSN for API + daemon (`@sentry/node`, tracesSampleRate `0.1`). Web: document `VITE_SENTRY_DSN` for a later pass |
| `WEB_HOST` | Web bind address (default `0.0.0.0`) |
| `JAVA_PATH` | Host Java binary (fallback when not using the per-server Java picker) |
| `DOCKER_IMAGE` | Default `eclipse-temurin:25-jre-jammy` |
| `DOCKER_LOG_MAX_SIZE` | Docker `json-file` max-size for game containers (default `10m`; daemon/`data/daemon.env`) |
| `DOCKER_LOG_MAX_FILE` | Docker `json-file` max-file count (default `3`) |
| `MANAGE_FIREWALL` | Open/close game ports via ufw when true |

## Database (panel)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Prisma MySQL URL (optional pool params: `connection_limit`, `pool_timeout`, `connect_timeout`) |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_DATABASE` / `MYSQL_USER` / `MYSQL_PASSWORD` | Same connection, split fields (installer / docs) |

Installer: `--mysql-docker` (default) or `--mysql-external` / `--database-url`. Game-server MySQL is separate (`data/daemon.env`, Docker `guartrix-mysql`).

## Registration & mail

| Variable | Purpose |
|----------|---------|
| `REGISTRATION_ENABLED` | Open signup (default on) |
| `DEFAULT_MAX_SERVERS` | New-user server quota (default **0**) |
| `DEFAULT_MAX_MEMORY_MB` | New-user RAM quota (default **0**) |
| `DEFAULT_MAX_DATABASES` | New-user DB quota (default **0**) |
| `MAIL_FROM` / `SMTP_*` | Password reset & invite mail; else `data/mail-outbox/` |
| `TWO_FACTOR_REQUIRED_ROLES` | Comma-separated roles that must enable TOTP (e.g. `ADMIN`). Empty = optional |
| `API_KEY_RATE_LIMIT` | Max Client API requests per minute per key (default **120**) |
| `APPLICATION_API_RATE_LIMIT` | Max Application API (`gta_`) requests per minute per key (default **120**) |
| `RATE_LIMIT_STORE` | `file` (default) persists counters under `data/rate-limits/`; `memory` is in-process only |
| `SESSION_STORE` | `file` (default, `data/sessions`) or `redis` (needs `REDIS_URL` + optional `ioredis`) |
| `REDIS_URL` | Redis URL when `SESSION_STORE=redis` (multi-API session sharing) |
| `CSP_REPORT_ONLY` | `1` = prod-web also sends CSP Report-Only (stricter `style-src 'self'`) for violation telemetry |
| `MOLLIE_API_KEY` | Mollie Payments API key (`test_…` / `live_…`); enables checkout |
| `BILLING_WEBHOOK_URL` | Optional outbound JSON webhook on payment paid / provisioned / subscription events |
| `CURSEFORGE_API_KEY` | Optional CurseForge API key for Modpacks tab search/install |
| `LICENSE_SERVER_URL` | Panel: license API URL. Default `https://license.guartrix.com` (or `https://license.<PUBLIC_HOST>` when `PUBLIC_HOST` is a real domain and the var is unset) |
| `SKIP_LOCAL_DAEMON` | Panel: `1` = no local daemon / local node (panel-only install; use remote nodes) |
| `BOT_WORKER` | Panel: Mineflayer bots in a forked child (default). Set `0` to run bots in-process (emergency only) |
| `LICENSE_KEY` | Panel license key |
| `LICENSE_INSTALL_ID` | Optional stable install id (else auto-file in `data/`) |
| `LICENSE_VERIFY_PUBLIC_KEY` | Ed25519 public key (PEM) to verify signed validate responses; else `data/licenses/signing-public.pem` |
| `LICENSE_ALLOW_UNSIGNED` | `1` = accept unsigned validate JSON (insecure; migration only) |
| `LICENSE_UNREACHABLE_GRACE_MS` | Soft-valid window if license host unreachable (default `86400000` = 24h) |
| `LICENSE_VALIDATE_INTERVAL_MS` | How often the panel calls `/v1/validate` in the background (default `600000` = 10m) |

The license **server** is hosted separately by Guartrix (default `https://license.guartrix.com`). Panel installs only need `LICENSE_SERVER_URL` and `LICENSE_KEY`. Without a valid key the panel runs the [free tier](licensing.md#free-tier-no-valid-license) (1 node, 1 server, 10 GB disk).

## Nodes & SFTP

| Variable | Purpose |
|----------|---------|
| `DAEMON_HOST` / `DAEMON_PORT` | Local daemon bind (loopback) |
| `DAEMON_PUBLIC_HOST` | Hostname prod-web routes to the local daemon (e.g. `node1.guartrix.com`). Empty = disabled |
| `DAEMON_PROXY_HOST` / `DAEMON_PROXY_PORT` | Upstream for that host (default `127.0.0.1:$DAEMON_PORT`) |
| `DAEMON_TLS_CERT_FILE` / `DAEMON_TLS_KEY_FILE` | Optional SNI cert for the daemon host (default Let’s Encrypt `node1.$PUBLIC_HOST`) |
| `DAEMON_TOKEN` | Optional override; else `data/daemon.env` (HMAC secret + legacy bearer) |
| `DAEMON_NODE_ID` | Panel node id (written into `daemon.env`; JWT `nid` claim) |
| `DAEMON_JWT_TTL` | Access JWT lifetime seconds (default `900`) |
| `DAEMON_JWT_WS_TTL` | WebSocket JWT lifetime seconds (default `3600`) |
| `DAEMON_JWT_LEGACY` | `false` (default) = JWT only; set `true` temporarily for old daemons that still send the raw token |
| `EXTRA_MOUNTS_ALLOW_PREFIX` | Comma-separated host path prefixes allowed for server extra mounts (default `/var/lib/guartrix/shared,/opt/guartrix/shared`) |
| `SFTP_PORT` / `SFTP_ENABLED` | Embedded SFTP per node |
| `PANEL_URL` | URL the daemon uses for SFTP password checks |
| `GUARTRIX_REPO_URL` | Git URL for remote install scripts |
| `MYSQL_PORT` / `MYSQL_IMAGE` | Per-node game MySQL container |
| `MYSQL_PUBLIC_HOST` | Hostname plugins use for game MySQL (default Docker DNS `guartrix-mysql`) |

## Cloudflare / TLS (optional)

| Variable | Purpose |
|----------|---------|
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_DOMAIN` | Auto A/SRV records (token: Zone DNS Edit on one zone — see [security.md](security.md)) |
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
| `ACTIVITY_WEBHOOK_URL` | Webhook for critical events; Discord URLs get embeds, others a generic JSON POST |
| `ALERT_EMAIL` | Address that also receives critical-event mail (needs `SMTP_*`) |
| `ACTIVITY_ALERT_MUTE` | Comma-separated action keys to never alert on, e.g. `auth.login-failed` |
| `BACKUP_OFFSITE_CMD` | Optional shell command after each backup (`{path}` `{serverId}` `{backupId}` `{fileName}`) |
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
