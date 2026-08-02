# Guartrix wiki

Operator and developer documentation for the Guartrix Minecraft hosting panel.

**Live panel:** [https://guartrix.com](https://guartrix.com)  
**Source:** [github.com/TomThermo/guartrix](https://github.com/TomThermo/guartrix)  
**Short overview:** [../../README.md](../../README.md)

## Start here

| Page | Description |
|------|-------------|
| **[Panel guide (screenshots)](panel-guide.md)** | Full UI tour — login, dashboard, console, SFTP, mods, admin, … |
| [Install the panel](install-panel.md) | One-shot Ubuntu install + existing checkout |
| [Install nodes](install-nodes.md) | Add remote daemons (SSH wizard / curl) |

## Contents

| Page | Description |
|------|-------------|
| [Architecture](architecture.md) | Monorepo layout, request flow, panel ↔ daemon |
| [Environment variables](env-reference.md) | `.env` / `daemon.env` knobs |
| [Accounts & quotas](accounts-and-quotas.md) | Register, verify, reset, quotas, subusers |
| [SFTP](sftp.md) | Per-node SFTP, username format, permissions |
| [Operations](operations.md) | Start/stop, watchdog, backups, logs, ports |
| [Activity log](activity-log.md) | Audit trail, filters, retention, Discord/email alerts |
| [Client API](client-api.md) | Personal API keys, Bearer auth, servers / power / files |
| [OpenAPI](../openapi.yaml) | Machine-readable Client + Application paths |
| [Application API & Mollie](application-api.md) | Admin machine keys, plan templates, Mollie checkout |
| [Licensing](licensing.md) | License server (:4040/:4041), keys, quotas, feature toggles, rate limits, version channel |
| [Release builds (sell / ship)](release-builds.md) | Minified bundles, tarball, password `/download` zips |
| [Schedules](schedules.md) | Schedule chains: backup → wait → restart → command |
| [Move between nodes](node-transfer.md) | Admin transfer: stop → sync → rebind ports/DNS → start |
| [Security](security.md) | Hardening checklist and known controls |
| [Scaling](scaling.md) | Multi-node scale; when Redis is (not) needed |
| [Development](development.md) | Local `dev:*` workflow |
| **[Roadmap](../roadmap.md)** | Done vs open sprints (Application API / Mollie done → …) |

## Screenshot preview

| Login | Dashboard | Console |
|-------|-----------|---------|
| ![Login](assets/01-login.png) | ![Dashboard](assets/02-dashboard.png) | ![Console](assets/08-server-console.png) |

| SFTP | Plugin Management | System |
|------|--------------------|--------|
| ![SFTP](assets/10-server-sftp.png) | ![Plugin Management](assets/12-server-addons.png) | ![System](assets/05-system-nodes.png) |

All screenshots live under [`assets/`](assets/) and are embedded in the [Panel guide](panel-guide.md).

## Version

Docs track the **main** branch (V0.2+ soft-launch / multi-node). When behaviour or UI changes, update the relevant wiki page, screenshots (`scripts/capture-docs-screenshots.mjs`), and the root README hub.
