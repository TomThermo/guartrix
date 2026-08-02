# Guartrix

Minecraft hosting panel — manage Paper/Fabric/Forge (and more) servers as **Docker containers** on one or more nodes. Web UI, API, and multi-node daemon with SFTP, MySQL, backups, Modrinth addons, and live console.

**Live:** [guartrix.com](https://guartrix.com) · **Repo:** [github.com/TomThermo/guartrix](https://github.com/TomThermo/guartrix) · **Docs:** [Wiki](docs/wiki/README.md) · **UI tour:** [Panel guide](docs/wiki/panel-guide.md) · **Roadmap:** [docs/roadmap.md](docs/roadmap.md)

---

## Screenshots

| Dashboard | Console | Plugin Management |
|-----------|---------|-------------------|
| ![Dashboard](docs/wiki/assets/02-dashboard.png) | ![Console](docs/wiki/assets/08-server-console.png) | ![Plugin Management](docs/wiki/assets/12-server-addons.png) |

| SFTP | File Manager | System / nodes |
|------|--------------|----------------|
| ![SFTP](docs/wiki/assets/10-server-sftp.png) | ![Files](docs/wiki/assets/09-server-files.png) | ![System](docs/wiki/assets/05-system-nodes.png) |

Full gallery (login, create server, users, backups, players, …): **[Panel guide](docs/wiki/panel-guide.md)**

---

## Features

| Area | Highlights |
|------|------------|
| Servers | Vanilla, Paper, Purpur, Fabric, Quilt, Forge, NeoForge — create, import, clone, **reinstall**, version/type change, world reset/upload |
| Console | Live WebSocket console + power controls |
| Metrics | Wings-style Docker Engine stats stream → WS push + cached disk |
| Limits | RAM, CPU (`--cpus`), disk quota (enforce writes / stop when over) |
| Files | In-panel file manager + **SFTP** per node (FileZilla / WinSCP, port 2022) |
| Players | Online list, whitelist, ops, bans |
| Addons | Modrinth plugins/mods, **modpacks** (Modrinth + optional CurseForge), **Geyser** one-click |
| Backups | Manual + scheduled archives, upload/download, restore |
| Databases | Per-server MySQL on the node (`guartrix-mysql`) |
| Accounts | Register (email verify), forgot/reset password, Terms & Privacy, subusers, optional TOTP 2FA |
| Quotas | New accounts start at **0** servers — raise limits when a plan is sold |
| Nodes | Local + remote daemons; Admin → System wizard (SSH install + live log); **Move** server between nodes |
| Activity | Audit trail per server + global admin view; optional Discord/email alerts on crashes & security events |
| Client API | Personal API keys (Bearer) with scoped permissions for scripts / CI |
| Billing | Mollie checkout + plans (optional auto-create server / subscriptions); Application API (`gta_`) |
| Licensing | License server (:4040 validate / :4041 console) + Admin → License; per-key quotas & feature toggles; expiry stops game servers |
| Ops | HTTPS, watchdog, panel DB dump, install scripts |

---

## Quick start

### New Ubuntu VPS (one command)

HTTP via server IP (no TLS):

```bash
curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash -s -- \
  --http --ip YOUR.PUBLIC.IP
```

HTTPS with a domain:

```bash
curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash -s -- \
  --https --domain your.domain.com --ip YOUR.PUBLIC.IP
```

Interactive installs ask whether to use HTTPS (default: HTTP/IP) and whether
panel MySQL should be Docker or an existing server (default: Docker).

(`scripts/install-panel.sh` is the same installer.)

Details: [Install the panel](docs/wiki/install-panel.md) · [Add nodes](docs/wiki/install-nodes.md)

### Existing checkout

```bash
cp .env.example .env   # set ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_*, DATABASE_URL, …
npm install
npm run db:generate && npm run db:push
npm run build && bash scripts/start.sh
```

Env reference: [Environment variables](docs/wiki/env-reference.md)

## Architecture

```
Browser ──HTTPS──► prod-web (:80/:443) ──/api /ws──► API (:3001, localhost)
                         │
                         └── static UI (apps/web/dist)
API ──HTTP + 1 WS/node──► Daemon(s) (:8081) ──► Docker MC + SFTP (:2022) + MySQL
```

| Package | Role |
|---------|------|
| `apps/web` | React panel UI |
| `apps/api` | Fastify API, sessions, Prisma (MySQL) |
| `apps/daemon` | Node agent HTTP API |
| `packages/node-agent` | Docker, files, SFTP, stats, MySQL helper |
| `packages/shared` | Shared types, permissions, license verify helpers |

License validate API lives in a **separate** operator checkout
(`../guartrix-license-server`), not this GitHub panel repo. Panels use
`LICENSE_SERVER_URL=https://license.guartrix.com`.

More: [Architecture](docs/wiki/architecture.md) · [Scaling](docs/wiki/scaling.md)

## Production

```bash
npm run build              # or: npm run build:release (minified Node apps)
bash scripts/start.sh      # preferred: stop old procs, health-check, watchdog
```

Sellable output: `npm run build:out` (folder `build/` + `bash build/start.sh`) or
`npm run package:release` — see [Release builds](docs/wiki/release-builds.md).

| Port | Bind | Notes |
|------|------|--------|
| 80 / 443 | public | Web; HTTP→HTTPS when TLS on |
| 3001 | localhost | API (proxied only) |
| 8081 | localhost / node | Daemon (short-lived JWT; shared secret in `daemon.env`) |
| 4040 | public (API) | License validate `/v1/validate` + `/health` |
| 4041 | localhost (default) | License admin console |
| 2022 | public (per node) | SFTP |
| 25565+ | public | Game ports |

Ops: [Operations](docs/wiki/operations.md) · [Security](docs/wiki/security.md)

## Accounts & quotas

- First boot creates `admin` from `ADMIN_PASSWORD` if no users exist.
- Register → **email verification** before subuser invites link.
- New accounts: `OPERATOR` with **0** server / RAM / DB quota until an admin raises limits (Users).
- Without SMTP, mail goes to `data/mail-outbox/`.

Details: [Accounts & quotas](docs/wiki/accounts-and-quotas.md)

## SFTP

- Username: `{panelUsername}.{serverId}`
- Password: panel account password
- Host: node hostname or IP · Port: **2022** · Protocol: **SFTP** (not FTP)

![SFTP](docs/wiki/assets/10-server-sftp.png)

See [SFTP](docs/wiki/sftp.md).

## Development

```bash
npm run dev:api      # :3001
npm run dev:web      # :5173 (proxies /api)
npm run dev:daemon   # optional Docker work
```

Guide: [Development](docs/wiki/development.md)

## Wiki

| Topic | Link |
|-------|------|
| Wiki home | [docs/wiki/README.md](docs/wiki/README.md) |
| **Panel guide (all screenshots)** | [panel-guide.md](docs/wiki/panel-guide.md) |
| Architecture | [architecture.md](docs/wiki/architecture.md) |
| Install panel | [install-panel.md](docs/wiki/install-panel.md) |
| Install nodes | [install-nodes.md](docs/wiki/install-nodes.md) |
| Env reference | [env-reference.md](docs/wiki/env-reference.md) |
| Accounts & quotas | [accounts-and-quotas.md](docs/wiki/accounts-and-quotas.md) |
| SFTP | [sftp.md](docs/wiki/sftp.md) |
| Operations | [operations.md](docs/wiki/operations.md) |
| Activity log & alerts | [activity-log.md](docs/wiki/activity-log.md) |
| Client API (API keys) | [client-api.md](docs/wiki/client-api.md) |
| Application API & Mollie | [application-api.md](docs/wiki/application-api.md) |
| Licensing | [licensing.md](docs/wiki/licensing.md) |
| Release builds (sell) | [release-builds.md](docs/wiki/release-builds.md) |
| Schedules (chains) | [schedules.md](docs/wiki/schedules.md) |
| Move between nodes | [node-transfer.md](docs/wiki/node-transfer.md) |
| Security | [security.md](docs/wiki/security.md) |
| Scaling | [scaling.md](docs/wiki/scaling.md) |
| Development | [development.md](docs/wiki/development.md) |

## License

Copyright © 2026 · Powered by **Guartrix**.
