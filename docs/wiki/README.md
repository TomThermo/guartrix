# Guartrix wiki

Operator and developer documentation for the Guartrix Minecraft hosting panel.

> **AI-generated project disclaimer**
>
> Guartrix was built as a Cursor AI experiment to test how far a **100% AI-generated** project could go. Because of that, the code and documentation may contain mistakes, bugs, incomplete behavior, or security issues. Do not assume production safety without doing your own review, testing, and hardening.

**Live panel:** [https://guartrix.com](https://guartrix.com)  
**Public wiki:** `/wiki` on the panel web app (left topic menu + search)  
**API Reference:** `/api-docs` (overview, explorer, Client & Application APIs)  
**Source:** [github.com/TomThermo/guartrix](https://github.com/TomThermo/guartrix)  
**Short overview:** [../../README.md](../../README.md)

## Start here

| Page | Description |
|------|-------------|
| **[Panel guide (screenshots)](panel-guide.md)** | Full UI tour — login, dashboard, console, SFTP, mods, admin, … |
| [Install the panel](install-panel.md) | Ubuntu install (download → run) + existing checkout |
| [Install nodes](install-nodes.md) | Add remote daemons (SSH wizard / curl) |
| [Upgrade to 1.1](upgrade-to-1.1.md) | 1.0.x → 1.1.0 migrate, env, scale smoke |
| [Upgrade to 1.2](upgrade-to-1.2.md) | 1.1.x → 1.2 SaaS/SLA env, Go-live, peer-only transfer |

## Getting started

| Page | Description |
|------|-------------|
| [Architecture](architecture.md) | Tech stack, monorepo, panel ↔ daemon, stats history |
| [Environment variables](env-reference.md) | `.env` / daemon env knobs |
| [Development](development.md) | Local `dev:*`, CI, i18n, enterprise code gates |
| [Enterprise code — wave 2+](enterprise-code-wave2.md) | E1–E6 engineering complete (v1.4.31) |
| [Enterprise code — wave 3](enterprise-code-wave3.md) | Operator SLA/pentest + optional tests |

## Panel

| Page | Description |
|------|-------------|
| [Accounts & quotas](accounts-and-quotas.md) | Register, verify, reset, **Profile** (email/password/phone/address), quotas, subusers |
| [Panel settings (Admin UI)](panel-settings.md) | Domain, SMTP, quotas, default backup retention, alerts, **Go-live** readiness; HTTPS / Turnstile / Redis under [Security](security.md) → Admin → Security |
| [SLA ops (templates)](sla-ops.md) | Incident / restore / secrets / capacity / HA |
| [SLA contract template](sla-contract-template.md) | Non-legal starting point for uptime / RTO / support |
| [Monitoring alerts example](monitoring-alerts.example.yml) | Prometheus rule sketches |
| [SLA drill log example](sla-drill-log.example.md) | How to record drills |
| [Pentest scope](pentest-scope.md) | Independent assessment brief |
| [Status overview](statusline.md) | Admin → Status health board |
| [Activity log](activity-log.md) | Audit trail, filters, retention, alerts |
| [Notifications and alerts](notifications-and-alerts.md) | Email, webhook, Discord status, push |
| [Licensing](licensing.md) | License key, Admin → License, free tier |
| [Auth and session internals](auth-and-session-internals.md) | Sessions, TOTP, API keys, daemon auth |
| [Billing internals](billing-internals.md) | Plans, Mollie, subscriptions |
| [License flow internals](license-flow-internals.md) | Signed claims, tickets, repo boundary |

## Nodes

| Page | Description |
|------|-------------|
| [Install nodes](install-nodes.md) | Remote daemons |
| [Daemon API](daemon-api.md) | Node control plane, routes, auth, metrics, stats history |
| [Node-agent internals](node-agent-internals.md) | Docker, files, quotas, SFTP, MySQL, stats ring |
| [SFTP](sftp.md) | Per-node SFTP, username format |
| [Move between nodes](node-transfer.md) | Admin transfer |

## Servers

| Page | Description |
|------|-------------|
| [Server management](server-management.md) | Create/import/clone/reinstall/transfer, Java + Bedrock |
| [Files and backups](files-and-backups.md) | File manager, SFTP jail, BackupSchedule, **per-server retention**, Admin → Servers |
| [Databases](databases.md) | Per-server MySQL on the node |
| [Networking and allocations](networking-and-allocations.md) | Ports, Bedrock UDP, Geyser, BlueMap |
| [Player management](player-management.md) | Online, whitelist, bans, history |
| [Mods, plugins, and modpacks](mods-plugins-and-modpacks.md) | Addons, CurseForge, modpacks |
| [Schedules](schedules.md) | Schedule chains: backup → wait → restart → command |

## API

| Page | Description |
|------|-------------|
| **[API overview](api-overview.md)** | Auth types, quick start, route map |
| **[API docs UI](api-docs-ui.md)** | Panel `/api-docs` product |
| **[API explorer](api-explorer.md)** | Interactive Try it |
| **[API examples](api-examples.md)** | curl + sample JSON |
| [API conventions](api-conventions.md) | Errors, rate limits, pagination |
| [Client API](client-api.md) | Personal `gt_` keys |
| [Application API & Mollie](application-api.md) | Admin `gta_` keys |
| [OpenAPI](../openapi.yaml) | Machine-readable paths |
| [API and surface map](api-surface-map.md) | UI pages, routes, packages, schema |

## Security

| Page | Description |
|------|-------------|
| [Security](security.md) | Hardening checklist and known controls |

## Operations

| Page | Description |
|------|-------------|
| [Operations](operations.md) | Start/stop, systemd vs start.sh, watchdog, ports |
| [Scaling](scaling.md) · [100n/1000c roadmap](../scale-100n-1000c-roadmap.md) | Multi-node scale; Redis HA |
| [Prod-web and downloads](prod-web-and-downloads.md) | Edge server, TLS, `/download` |
| [Release builds (sell / ship)](release-builds.md) | Minified bundles, password zips |
| [Build and release internals](build-and-release-internals.md) | `build/`, staging, package scripts |
| [Shared contracts](shared-contracts.md) | Types, permissions, daemon JWT, license verify |
| **[Improvement map](../roadmap.md)** | Shipped product; customer go-live in install docs |

## Operator scripts

| Script | Role |
|--------|------|
| `scripts/start.sh` | Process start + watchdog |
| `scripts/install-panel.sh` / `install-daemon.sh` | Host installers |
| `scripts/db-migrate.sh` | Prisma migrate deploy |
| `scripts/monitor.sh` | Watchdog |
| `scripts/prod-web.mjs` (+ `prod-web/`) | Web edge / reverse proxy |
| `scripts/backup-panel-db.sh` / `install-panel-backup-cron.sh` | Panel DB backups |
| `scripts/sla-restore-drill.sh` | Panel DB backup / staging restore drill |
| `scripts/sla-secret-rotation-drill.sh` | Secret rotation checklist + live smoke |
| `scripts/sla-capacity-review-drill.sh` | Capacity snapshot + Go-live date |
| `scripts/sla-go-live-drill.sh` | One-shot live SLA drills + attest-all |
| `scripts/lib.sh` | Shared helpers |

Release packaging, screenshot capture, and download-gate scripts stay on the **operator host only** (not in the public git tree).

See also [Operations](operations.md) · [Release builds](release-builds.md) · [API surface map](api-surface-map.md).

## Screenshot preview

| Login | Dashboard | Console |
|-------|-----------|---------|
| ![Login](assets/01-login.png) | ![Dashboard](assets/02-dashboard.png) | ![Console](assets/08-server-console.png) |

| SFTP | Plugin Management | System |
|------|--------------------|--------|
| ![SFTP](assets/10-server-sftp.png) | ![Plugin Management](assets/12-server-addons.png) | ![System](assets/05-system-nodes.png) |

All screenshots live under [`assets/`](assets/) and are embedded in the [Panel guide](panel-guide.md).

### Screenshot refresh (after UI changes)

Wiki screenshots live under [`assets/`](assets/). Refresh tooling (`ensure-demo-admin`, `capture-wiki-screenshots`) is **operator-host only** (not shipped in the public repo). On the docs host:

```bash
# Operator machine only — scripts are gitignored on public main
node scripts/ensure-demo-admin.mjs
GUARTRIX_BASE_URL=http://127.0.0.1:80 \
GUARTRIX_USER=demo GUARTRIX_PASS='DemoScreenshots!2026' \
GUARTRIX_SERVER_ID=… GUARTRIX_DEMO_SERVER_NAME=server1 \
GUARTRIX_VIEWPORT=1440x900 \
GUARTRIX_PALETTE=crimson GUARTRIX_THEME=dark \
  node scripts/capture-wiki-screenshots.mjs
```

All assets are captured at a fixed **1440×900** viewport with the **Crimson Graphite** palette.

| Asset | Notes |
|-------|-------|
| `01`–`37` | Full panel tour (refreshed together) |
| `38-admin-servers.png` | Admin → Servers |
| `39-admin-settings.png` | Admin → Settings |

## Version

These docs track the **main** branch. When behavior or UI changes, update the relevant wiki page, screenshots (`scripts/capture-wiki-screenshots.mjs`), the public wiki mirror (`apps/web/src/wiki/`), and the root README hub.
