# Architecture

## High-level

Guartrix is a **single panel** (web + API) that controls **one or more daemons** (nodes). Each daemon runs Minecraft servers as Docker containers on its host — each with its own Docker host.

```
Browser
  │  HTTPS :443 (HTTP :80 → redirect)
  ▼
prod-web.mjs          serves apps/web/dist
  │  proxy /api, /ws
  ▼
API :3001 (localhost) sessions, Prisma, quotas, SFTP-auth
  │  HTTP/WS Bearer JWT → daemon (HMAC with node secret; legacy bearer OK)
  │  1× WebSocket → daemon /events (status, console, **stats**)
  ▼
Daemon :8081          @msm/node-agent
  ├── Docker Minecraft containers
  ├── Docker Engine stats stream (per RUNNING server, Wings-style)
  ├── Cached disk usage (non-blocking refresh)
  ├── SFTP :2022
  └── optional guartrix-mysql (game DBs)
```

## Monorepo

| Path | Role |
|------|------|
| `apps/web` | React UI (Vite). Production build in `dist/`. |
| `apps/api` | Fastify API, file sessions, Prisma → panel MySQL |
| `apps/daemon` | Thin HTTP wrapper around `packages/node-agent` |
| `packages/node-agent` | Docker lifecycle, resource monitor, files, SFTP, firewall, MySQL helper |
| `packages/shared` | Types, permissions, activity, **daemon JWT** + **license verify** helpers, password policy |
| `scripts/` | `start.sh`, `prod-web.mjs`, installers, backups, monitor |

**License validation** uses the public API at `LICENSE_SERVER_URL` (default
`https://license.guartrix.com`) plus `LICENSE_KEY`. Without a valid license the
panel enforces a free tier (1 node, 1 server, 10 GB disk). See [Licensing](licensing.md).

## Resource limits

| Limit | Behaviour |
|-------|-----------|
| **RAM** (`memoryMb`) | Docker `--memory` (+ overhead); Java `-Xmx` |
| **CPU** (`cpuLimit`) | Percent of one core (100 = 1.0). Docker `--cpus`. `0` = unlimited |
| **Disk** (`diskMb`) | Enforced on panel uploads, file writes, and SFTP. Start refused if already over. Running servers are **stopped** when over quota (Wings-style) |

Defaults for new servers: **10 GB** disk, CPU unlimited (create UI defaults to 2 cores). Admins change limits under Server Properties → Performance.

## Allocations (ports)

Pterodactyl-style **allocations** track IP:port inventory per node:

- **Primary** allocation mirrors `Server.port` (game port) and stays in sync when the port changes.
- **Extra** allocations are additional published Docker ports (`-p host:container/proto`) plus matching UFW rules.
- Admins can pre-create free port ranges on a node (`POST /api/admin/nodes/:id/allocations`); users assign them under **Network** on the server.
- Changing assigned ports requires a **server restart** so Docker republishes bindings.

On API boot, missing primary rows are backfilled from existing servers.

## Node transfer

Admins can **Move** a stopped server to another node (`POST /api/servers/:id/transfer`).
The panel streams a `.tar.gz` from the source daemon to the destination (one temp
archive on the panel — no full unpack), rebinds allocations / firewall / DNS,
then wipes the source. MySQL databases dump/restore automatically. Status is
`TRANSFERRING` until finish.

Details: [Move between nodes](node-transfer.md)

## Activity log

Route handlers call a fire-and-forget recorder (`apps/api/src/activity-log.ts`)
that writes an `ActivityEvent` row with actor, IP, server, success and metadata.
Action keys and labels live in `packages/shared/src/activity.ts` so UI and API
agree. Two extra sources feed the same table: process-manager status transitions
(crash / unexpected offline) and the daemon event bridge (node online/offline).
Actions flagged `critical` also go to `notifications.ts` for webhook/email.

Details: [Activity log](activity-log.md)

## Resource monitoring

While a server is **RUNNING**, the daemon opens a Docker Engine API stats stream (`/containers/…/stats?stream=1`) — same approach as Pterodactyl Wings. Samples are:

1. Cached on the daemon (`resourceMonitor`)
2. Pushed over `/events` as `{ type: "stats", serverId, stats }`
3. Forwarded by the panel into the console WebSocket (`type: "stats"`)
4. Served instantly from cache on `GET /api/servers/:id/stats`

Disk walks use a **30s cache** (stale-while-revalidate) so UI polls never block on large worlds.

## Data flow notes

- **Sessions:** `data/sessions/*.json` (not Redis). Survive API restart on the same host. Session cookies use `rolling: false` so routine GETs/polls do not rewrite the session file every request (expiry still follows `maxAge` from login).
- **Dashboard online counts:** `GET /api/servers/online` uses the daemon/console player cache only (no Minecraft query ping), scoped to servers the user can see.
- **Daemon tokens:** long-lived shared secret per node (vault + `data/daemon.env`). On the wire the panel sends **short-lived HS256 JWTs** (`aud=daemon`, `nid`, `exp`) signed with that secret. Raw bearer is rejected unless `DAEMON_JWT_LEGACY=true`. SFTP callbacks use `aud=panel` JWTs.
- **Server files:** on the node under `data/servers/<serverId>/` (or daemon `DATA_DIR`). File **list/read** does not run a recursive `chown`; ownership is fixed on start and on write/upload/SFTP paths.
- **Console:** browser connects to the **panel** WebSocket; the panel fans out daemon event streams (output, status, stats).
- **Mineflayer bots:** run in a **forked API child** (`bot-worker-main`) so physics/event loops stay out of the Fastify process. The panel proxies spawn/list/command over IPC; `BOT_WORKER=0` forces in-process emergency mode.

## Trust boundaries

- Public: `:80`, `:443`, game ports, SFTP `:2022` per node.
- Private: API `:3001`, daemon `:8081` (local node; optional public HTTPS via prod-web Host `DAEMON_PUBLIC_HOST` → loopback), panel MySQL.
- Remote daemons expose `:8081` to the **panel host only** (firewall / private network), or use their own reverse proxy + public hostname.

See also [Scaling](scaling.md) and [Security](security.md).
