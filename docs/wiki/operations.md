# Operations

## Preferred restart

```bash
npm run build              # after code changes (readable tsc)
# or: npm run build:release   # minified Node bundles (see release-builds.md)
bash scripts/start.sh      # stop old procs → health-check → watchdog
```

Alternatives: `npm run prod` or `npm run build && npm run start:prod`.

## Ports

| Service | Bind | Notes |
|---------|------|--------|
| Web HTTP | `0.0.0.0:80` | Redirects to HTTPS when TLS on |
| Web HTTPS | `0.0.0.0:443` | Origin cert in `cert/` or `TLS_*` |
| API | `127.0.0.1:3001` | Not public — proxied by web |
| Daemon (local) | `127.0.0.1:8081` | Token in `data/daemon.env` |
| License API | remote / local | Public validate via `LICENSE_SERVER_URL` (default `https://license.guartrix.com`). Local process only when `SKIP_LOCAL_LICENSE_SERVER=0` and sibling `guartrix-license-server` is present |
| License UI | `127.0.0.1:4041` | Admin console on the license host only (see [Licensing](licensing.md)) |
| SFTP | `0.0.0.0:2022` | Per node |
| MySQL | `127.0.0.1:3306` | Panel (+ game DB container on nodes) |

Binding ports &lt; 1024 needs passwordless sudo, or set `WEB_PORT=8080`.

## Watchdog

`scripts/start.sh` starts `scripts/monitor.sh` (~20s interval):

- Restarts license / daemon / API / web if unhealthy
- Does **not** restart `docker.service` (would wipe `--rm` game containers)
- Does **not** stop Minecraft servers when the panel restarts
- When `ACTIVITY_WEBHOOK_URL` is set, posts Discord-compatible alerts on restart / critical backoff

Disable with `NO_MONITOR=1`. Logs: `data/logs/guartrix-*.log` (includes `guartrix-license.log`).

If you run under **systemd** (`guartrix-{daemon,api,web}.service` from `install-panel.sh`),
prefer **`bash scripts/start.sh`** for the first boot / day-to-day ops so the
watchdog stays attached. Mixing `systemctl restart guartrix-api` alone will not
restart the monitor process.

## Panel DB backup

```bash
bash scripts/backup-panel-db.sh
# → data/backups/panel/guartrix_panel_*.sql.gz (keeps last 14)
```

`DATABASE_URL` is parsed with a real URL parser (passwords with `@` / `%` work).

Install a daily timer (03:15 UTC ± jitter):

```bash
sudo bash scripts/install-panel-backup-cron.sh
# or user crontab:
# 15 3 * * * cd /path/to/guartrix && bash scripts/backup-panel-db.sh >> data/logs/guartrix-panel-db-backup.log 2>&1
```

Copy dumps off-box periodically — a failed disk loses users, quotas, billing and activity.

## License store backup

```bash
bash scripts/backup-licenses.sh
# → data/backups/licenses/licenses_*.tar.gz (keys + signing PEMs; keeps last 30)
```

Daily timer (~03:30 UTC):

```bash
sudo bash scripts/install-license-backup-cron.sh
```

Without these backups a lost disk loses **all customer license keys** and the Ed25519
signing key (panels must get a new public key if you regenerate).

## Public license hostname TLS

`license.guartrix.com` is **DNS-only** (grey cloud) with a Let’s Encrypt cert on prod-web SNI
(so `/v1/validate` is not blocked by Cloudflare bot challenges):

```bash
sudo bash scripts/install-license-le-cert.sh
bash build/start.sh
```

## Public daemon hostname TLS (local node)

`node1.guartrix.com` is **DNS-only** with Let’s Encrypt on prod-web SNI, proxying to the
local daemon on `127.0.0.1:8081`. Set the node URL in Admin → System to
`https://node1.guartrix.com` (port **443**):

```bash
# .env: DAEMON_PUBLIC_HOST=node1.guartrix.com
sudo bash scripts/install-daemon-le-cert.sh
bash build/start.sh
```

## Data layout

| Path | Contents |
|------|----------|
| `data/servers/<id>/` | World, jar, configs, logs (local node) |
| `data/backups/` | Server archives + panel SQL dumps + license tarballs |
| `data/licenses/` | `licenses.json`, channel, signing PEMs |
| `data/sessions/` | File session store |
| `data/daemon.env` | Daemon token, MySQL root, etc. |
| `data/mail-outbox/` | Outbound mail when SMTP unset |
| `data/logs/` | daemon / api / web / monitor |
| `data/mysql/` | MySQL volume if used on host |
| `cert/` | TLS cert + key |
| `.env` | Secrets |

## Activity log

Actions are recorded in the panel DB and shown per server (**Activity Log** tab)
and globally under **Activity** for admins. The API prunes rows older than
`ACTIVITY_LOG_RETENTION_DAYS` (default 90, `0` = forever) once an hour, so the
table grows with traffic — include it in the panel DB dump above.

Wire `ACTIVITY_WEBHOOK_URL` (Discord or generic) and/or `ALERT_EMAIL` to get
pinged on crashes, unexpected offline, node loss and security events:
[Activity log](activity-log.md).

## Modrinth (Plugin Management browse)

The API calls `api.modrinth.com` with a ~12s timeout and retries transient
5xx/429 responses. Browse search also falls back to simpler Modrinth facets if
the full filter set fails. `scripts/start.sh` sets
`NODE_OPTIONS=--dns-result-order=ipv4first` for the API process so Node does not
hang on broken host IPv6 to Cloudflare. If browse stays empty with a timeout /
502 error, check outbound HTTPS from the panel host
(`curl -4 -I https://api.modrinth.com/v2/`).

## Host hardening (optional)

```bash
bash scripts/install-host-hardening.sh   # sudo — UFW cleanup + logrotate
```

## Public install scripts

When the panel is up:

- `https://YOUR_PANEL/install.sh` (same as `install-panel.sh`)
- `https://YOUR_PANEL/install-panel.sh`
- `https://YOUR_PANEL/install-daemon.sh`
