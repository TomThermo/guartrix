# Operations

## Preferred restart

```bash
npm run build              # after code changes (readable tsc)
# or: npm run build:release   # minified Node bundles (see release-builds.md)
bash scripts/start.sh      # stop old procs → health-check → watchdog
```

Alternatives: `npm run prod` or `npm run build && npm run start:prod`.

Operational internals reference:

- [Prod-web and downloads](prod-web-and-downloads.md)
- [Build and release internals](build-and-release-internals.md)
- [Daemon API](daemon-api.md)
- [Node-agent internals](node-agent-internals.md)

## Ports

| Service | Bind | Notes |
|---------|------|--------|
| Web HTTP | `0.0.0.0:80` | Redirects to HTTPS when TLS on |
| Web HTTPS | `0.0.0.0:443` | Origin cert in `cert/` or `TLS_*` |
| API | `127.0.0.1:3001` | Not public — proxied by web |
| Daemon (local) | `127.0.0.1:8081` | Token in `data/daemon.env` |
| SFTP | `0.0.0.0:2022` | Per node |
| MySQL | `127.0.0.1:3306` | Panel (+ game DB container on nodes) |

Binding ports &lt; 1024 needs passwordless sudo, or set `WEB_PORT=8080`.

## Password downloads (DNS-only)

Set `DOWNLOAD_PUBLIC_HOST=download.guartrix.com` and issue a Let's Encrypt cert
(`sudo bash scripts/install-download-le-cert.sh`). The A record stays **DNS-only**
(grey cloud) so customers hit origin TLS instead of a Cloudflare bot challenge.
Apex `/download` redirects to that host when configured.

## Watchdog

`scripts/start.sh` starts `scripts/monitor.sh` (~20s interval):

- Checks API `/api/health` (liveness) and `/api/ready` (DB), daemon `/health` and `/ready` (Docker)
- Restarts daemon / API / web if unhealthy
- Does **not** restart `docker.service` (would wipe `--rm` game containers)
- Does **not** stop Minecraft servers when the panel restarts
- When `ACTIVITY_WEBHOOK_URL` is set, posts Discord-compatible alerts on restart / critical backoff

Disable with `NO_MONITOR=1`. Logs: `data/logs/guartrix-*.log`.

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

Install a daily timer (03:15 UTC ± jitter) on the **customer's panel host** — also [customer install checklist](../roadmap.md#customer-install-their-vps--documented-not-this-host):

```bash
sudo bash scripts/install-panel-backup-cron.sh
# or user crontab:
# 15 3 * * * cd /path/to/guartrix && bash scripts/backup-panel-db.sh >> data/logs/guartrix-panel-db-backup.log 2>&1
```

Copy dumps off-box periodically — a failed disk loses users, quotas, billing and activity.

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

The daemon's sensitive runtime behavior behind these paths is described in [Node-agent internals](node-agent-internals.md).

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

When the panel is up, download then run (do not pipe into bash as the primary method):

```bash
curl -Lo /tmp/guartrix-install.sh https://YOUR_PANEL/install-panel.sh
sudo bash /tmp/guartrix-install.sh
```

Also served:

- `https://YOUR_PANEL/install.sh` (thin wrapper → downloads `install-panel.sh`)
- `https://YOUR_PANEL/install-panel.sh`
- `https://YOUR_PANEL/install-daemon.sh`

## See also

- [Install the panel](install-panel.md)
- [Install nodes](install-nodes.md)
- [Notifications and alerts](notifications-and-alerts.md)
