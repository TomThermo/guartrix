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
| `SESSION_SECRET` | Long random string |
| `SESSION_SECURE` | `true` when serving over HTTPS; `false` for plain HTTP/IP |
| `TRUST_PROXY` | `true` behind Cloudflare / prod-web HTTPS; usually `false` for direct IP HTTP |
| `TRUSTED_PROXIES` | Peer IPs allowed to set `X-Forwarded-For` (default `127.0.0.1,::1`). Use `*` only if every hop is trusted |
| `PUBLIC_HOST` | Canonical hostname or IP (also HTTPS redirect target when TLS on) |
| `PUBLIC_IP` | Public IP when useful for players/DNS |
| `PUBLIC_BASE_URL` | Full origin, e.g. `https://guartrix.com` or `http://203.0.113.10` |
| `DATA_DIR` | Default `./data` |
| `DOCKER_IMAGE` | Default `eclipse-temurin:25-jre-jammy` |
| `MANAGE_FIREWALL` | Open/close game ports via ufw when true |

## Database (panel)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Prisma MySQL URL |
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
| `MOLLIE_API_KEY` | Mollie Payments API key (`test_…` / `live_…`); enables checkout |
| `BILLING_WEBHOOK_URL` | Optional outbound JSON webhook on payment paid / provisioned / subscription events |
| `CURSEFORGE_API_KEY` | Optional CurseForge API key for Modpacks tab search/install |
| `LICENSE_SERVER_URL` | Panel: license API URL (default `https://license.$PUBLIC_HOST` / `https://license.guartrix.com`) |
| `SKIP_LOCAL_LICENSE_SERVER` | Panel: `1` = do not start a local license process (customer default). Operator hosts with a sibling checkout may set `0` |
| `SKIP_LOCAL_DAEMON` | Panel: `1` = no local daemon / local node (panel-only install; use remote nodes) |
| `LICENSE_SERVER_HOME` | Optional absolute path to the sibling `guartrix-license-server` checkout (default `$ROOT/../guartrix-license-server`) |
| `LICENSE_KEY` | Panel license key |
| `LICENSE_INSTALL_ID` | Optional stable install id (else auto-file in `data/`) |
| `LICENSE_VERIFY_PUBLIC_KEY` | Ed25519 public key (PEM) to verify signed validate responses; else `data/licenses/signing-public.pem` |
| `LICENSE_ALLOW_UNSIGNED` | `1` = accept unsigned validate JSON (insecure; migration only) |
| `LICENSE_UNREACHABLE_GRACE_MS` | Soft-valid window if license host unreachable (default `86400000` = 24h) |
| `LICENSE_VALIDATE_INTERVAL_MS` | How often the panel calls `/v1/validate` in the background (default `600000` = 10m) |
| `LICENSE_PUBLIC_HOST` | Hostname prod-web routes to the license API (default `license.$PUBLIC_HOST`) |
| `LICENSE_PROXY_HOST` / `LICENSE_PROXY_PORT` | Upstream for that host (default `127.0.0.1:4040`) |
| `LICENSE_TLS_CERT_FILE` / `LICENSE_TLS_KEY_FILE` | Optional SNI cert for the license host (default Let’s Encrypt `license.$PUBLIC_HOST`) |
| `DAEMON_PUBLIC_HOST` | Hostname prod-web routes to the local daemon (e.g. `node1.guartrix.com`) |

License **server** bind/secret live in **`data/license.env`** on the license host.
The template (`data/license.env.example`) ships with the **guartrix-license-server** package
(next to the live `data/license.env`; also on `/download` for operators) — it is **not** in this panel GitHub repo:

| Variable | Purpose |
|----------|---------|
| `LICENSE_SERVER_HOST` / `LICENSE_SERVER_PORT` | License API bind (default `0.0.0.0:4040`) |
| `LICENSE_SERVER_URL` | Public URL in `/health` / console context |
| `LICENSE_UI_HOST` / `LICENSE_UI_PORT` | Admin console bind (default **`127.0.0.1:4041`**) |
| `LICENSE_ADMIN_SECRET` | Required strong secret (no defaults; refuses `change-me`) |
| `LICENSE_TRUST_PROXY` | `1` = trust `X-Forwarded-For` (only behind your reverse proxy). Loopback UI→API proxy always trusts forwarded IP |
| `LICENSE_RATE_VALIDATE_PER_MIN` | Max `/v1/validate` per IP / min (default `30`) |
| `LICENSE_RATE_ADMIN_LOGIN_PER_MIN` | Max admin logins per IP / min (default `5`) |
| `LICENSE_RATE_PUBLIC_PER_MIN` | Max `/v1/latest` + `/v1/public-key` per IP / min (default `60`) |
| `LICENSE_RATE_ADMIN_PROBE_PER_MIN` | Max failed admin Bearer probes per IP / min (default `20`) |
| `LICENSE_RATE_ADMIN_API_PER_MIN` | Max authenticated admin API calls per IP / min (default `120`) |
| `LICENSE_SEED_DEV` | `1` = seed a tight-quota local key when store is empty |
| `PUBLIC_IP` | Optional CORS helper for the console |
| `DATA_DIR` | Optional store root (default `./data` → `data/licenses/`) |

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
| `SFTP_PORT` / `SFTP_ENABLED` | Embedded SFTP per node |
| `PANEL_URL` | URL the daemon uses for SFTP password checks |
| `GUARTRIX_REPO_URL` | Git URL for remote install scripts |
| `MYSQL_PORT` / `MYSQL_IMAGE` | Per-node game MySQL container |

## Cloudflare / TLS (optional)

| Variable | Purpose |
|----------|---------|
| `CLOUDFLARE_API_TOKEN` / `ZONE_ID` / `DOMAIN` | Auto A records for servers |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | Override Origin cert paths (panel behind Cloudflare) |
| `LICENSE_TLS_CERT_FILE` / `LICENSE_TLS_KEY_FILE` | SNI cert for DNS-only `license.*` (LE by default) |
| `DAEMON_TLS_CERT_FILE` / `DAEMON_TLS_KEY_FILE` | SNI cert for DNS-only `node1.*` / `DAEMON_PUBLIC_HOST` (LE by default) |
| `LETSENCRYPT_EMAIL` | Email for `scripts/install-license-le-cert.sh` / `install-daemon-le-cert.sh` |
| `DOWNLOAD_PASSWORD` | Enables `https://$PUBLIC_HOST/download` (release zip gate) |
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

See [Activity log](activity-log.md) for the event list and payload format.

## Watchdog

| Variable | Purpose |
|----------|---------|
| `NO_MONITOR` | `1` disables `scripts/monitor.sh` |
| `MONITOR_INTERVAL` | Seconds between checks |
| `BOOT_START_STAGGER_MS` | Delay between auto-start servers after reboot |

See `.env.example` for the full commented template.
