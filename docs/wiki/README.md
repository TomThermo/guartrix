# Guartrix wiki

Operator and developer documentation for the Guartrix Minecraft hosting panel.

> **AI-generated project disclaimer**
>
> Guartrix was built as a Cursor AI experiment to test how far a **100% AI-generated** project could go. Because of that, the code and documentation may contain mistakes, bugs, incomplete behavior, or security issues. Do not assume production safety without doing your own review, testing, and hardening.

**Live panel:** [https://guartrix.com](https://guartrix.com)  
**Public wiki:** `/wiki` on the panel web app (left topic menu + search)  
**API Reference:** `/api-docs` (overview, explorer, Client & Application APIs)  
**Source:** [github.com/TomThermo/guartrix](https://github.com/TomThermo/guartrix)  
**Short overview:** [../../README.md](../../README.md) · [Contributing](../../CONTRIBUTING.md)

## Start here

| Page | Description |
|------|-------------|
| **[Panel guide (screenshots)](panel-guide.md)** | Full UI tour — login, dashboard, console, SFTP, mods, admin, … |
| [Install the panel](install-panel.md) | Ubuntu install (download → run) + existing checkout |
| [Install nodes](install-nodes.md) | Add remote daemons (SSH wizard / curl) |

## Contents

| Page | Description |
|------|-------------|
| [Architecture](architecture.md) | Tech stack (Node, Vite, React, Fastify, Prisma/MySQL, Docker, Redis), monorepo, panel ↔ daemon |
| [API and surface map](api-surface-map.md) | Full inventory of UI pages, route families, daemon routes, packages, scripts, and schema domains |
| [Environment variables](env-reference.md) | `.env` / daemon env knobs (local `data/daemon.env` vs remote `/var/lib/guartrix/daemon.env`) |
| [Panel settings (Admin UI)](panel-settings.md) | Domain, SMTP, HTTPS, quotas, alerts via Admin → Settings |
| [Status overview](statusline.md) | Admin → Status health board (web, API, watchdog, nodes) |
| [Accounts & quotas](accounts-and-quotas.md) | Register, verify, reset, quotas, subusers |
| [Auth and session internals](auth-and-session-internals.md) | Sessions, TOTP, API keys, app passwords, daemon auth, invite/reset token surfaces |
| [Server management](server-management.md) | Create/import/clone/reinstall/transfer, Java + Bedrock server types, world tools, resource packs |
| [Databases](databases.md) | Per-server MySQL on the node, quotas, shared Docker MySQL notes |
| [Bots](bots.md) | Admin Mineflayer bots (online-mode=false, Via*, worker) |
| [Files and backups](files-and-backups.md) | File manager, SFTP, jail rules, backup and restore flows |
| [Networking and allocations](networking-and-allocations.md) | Ports, native Bedrock (UDP), Geyser, BlueMap 8100, Velocity/Bungee helpers, Docker networks |
| [Player management](player-management.md) | Online players, whitelist, bans, moderation, history |
| [Mods, plugins, and modpacks](mods-plugins-and-modpacks.md) | Addons, CurseForge, engine compatibility, modpacks |
| [SFTP](sftp.md) | Per-node SFTP, username format, permissions |
| [Notifications and alerts](notifications-and-alerts.md) | Email, activity webhook, per-server Discord status, push |
| [Operations](operations.md) | Start/stop, systemd vs start.sh, watchdog, backups, logs, ports |
| [Activity log](activity-log.md) | Audit trail, filters, retention, Discord/email alerts |
| **[API overview](api-overview.md)** | Auth types, quick start, route map |
| **[API docs UI](api-docs-ui.md)** | Panel `/api-docs` product (separate from wiki) |
| **[API explorer](api-explorer.md)** | Interactive Try it + cURL/PHP/Python/… |
| **[API examples](api-examples.md)** | curl + sample JSON request/response |
| [API conventions](api-conventions.md) | Errors, rate limits, pagination, headers |
| [Client API](client-api.md) | Personal `gt_` keys — permissions & endpoint index |
| [OpenAPI](../openapi.yaml) | Machine-readable Client + Application paths |
| [Application API & Mollie](application-api.md) | Admin `gta_` keys, provisioning, billing automation |
| [Billing internals](billing-internals.md) | Plan templates, payment lifecycle, quota application, subscriptions, machine API |
| [Licensing](licensing.md) | License key, Admin → License, remote validate API |
| [License flow internals](license-flow-internals.md) | Signed claims, daemon ticketing, grace/fallback behavior, repo boundary |
| [Release builds (sell / ship)](release-builds.md) | Minified bundles, tarball, password `/download` zips |
| [Build and release internals](build-and-release-internals.md) | `build/`, staging, sanitize rules, package scripts, release pipeline |
| [Prod-web and downloads](prod-web-and-downloads.md) | Edge server, reverse proxy, TLS, `/download` boundary |
| [Schedules](schedules.md) | Schedule chains: backup → wait → restart → command |
| [Move between nodes](node-transfer.md) | Admin transfer: stop → sync → rebind ports/DNS → start |
| [Security](security.md) | Hardening checklist and known controls |
| [Scaling](scaling.md) · [100n/1000c roadmap](../scale-100n-1000c-roadmap.md) | Multi-node scale; when Redis is (not) needed |
| [Development](development.md) | Local `dev:*` workflow, Vitest + coverage floor, CI, i18n |
| [Daemon API](daemon-api.md) | Node-local control plane, route groups, auth, metrics, reattach model |
| [Node-agent internals](node-agent-internals.md) | Docker, files, quotas, SFTP, MySQL, firewall, player history |
| [Shared contracts](shared-contracts.md) | Shared types, permissions, activity taxonomy, daemon JWT, license verification |
| **[Improvement map](../roadmap.md)** | Shipped product; customer go-live in install docs |

## Operator scripts

| Script | Role |
|--------|------|
| `scripts/start.sh` | Process start + watchdog (operator checkout) |
| `scripts/build-out.sh` | Stage `build/` release tree |
| Download packaging script | Customer `/download` zips (operator host only) |
| `scripts/install-panel.sh` / `install-daemon.sh` | Host installers |
| `scripts/db-migrate.sh` | Prisma migrate deploy |
| `scripts/monitor.sh` | Watchdog |
| `scripts/lib.sh` | Shared helpers |

See also [Operations](operations.md) · [Release builds](release-builds.md) · [API surface map](api-surface-map.md) · [Contributing](../../CONTRIBUTING.md).

## Screenshot preview

| Login | Dashboard | Console |
|-------|-----------|---------|
| ![Login](assets/01-login.png) | ![Dashboard](assets/02-dashboard.png) | ![Console](assets/08-server-console.png) |

| SFTP | Plugin Management | System |
|------|--------------------|--------|
| ![SFTP](assets/10-server-sftp.png) | ![Plugin Management](assets/12-server-addons.png) | ![System](assets/05-system-nodes.png) |

All screenshots live under [`assets/`](assets/) and are embedded in the [Panel guide](panel-guide.md).

## Version

These docs track the **main** branch. When behavior or UI changes, update the relevant wiki page, screenshots (`scripts/capture-wiki-screenshots.mjs`), the public wiki mirror (`apps/web/src/wiki/wiki-content.ts`), and the root README hub.
