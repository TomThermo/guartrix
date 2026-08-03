# Guartrix

**Self-hosted Minecraft hosting panel** — provision and operate game servers as Docker containers across one or more nodes.

| | |
|---|---|
| **Product** | [guartrix.com](https://guartrix.com) |
| **Source** | [github.com/TomThermo/guartrix](https://github.com/TomThermo/guartrix) |
| **Documentation** | [Wiki](docs/wiki/README.md) · [Panel guide](docs/wiki/panel-guide.md) · [Roadmap](docs/roadmap.md) |

---

## Overview

Guartrix is a panel / daemon stack for commercial or private Minecraft hosting:

- **Panel** — web UI and API for users, servers, billing hooks, and administration  
- **Daemon** — per-machine agent that runs Docker game containers, SFTP, and node MySQL  
- **Multi-node** — local and remote nodes; move servers between hosts from the admin UI  

Supported server types include Vanilla, Paper, Purpur, Fabric, Quilt, Forge, and NeoForge.

---

## Screenshots

| Dashboard | Console | Plugins |
|-----------|---------|---------|
| ![Dashboard](docs/wiki/assets/02-dashboard.png) | ![Console](docs/wiki/assets/08-server-console.png) | ![Addons](docs/wiki/assets/12-server-addons.png) |

| SFTP | Files | Nodes |
|------|-------|-------|
| ![SFTP](docs/wiki/assets/10-server-sftp.png) | ![Files](docs/wiki/assets/09-server-files.png) | ![System](docs/wiki/assets/05-system-nodes.png) |

Full UI tour: [Panel guide](docs/wiki/panel-guide.md).

---

## Capabilities

**Game servers** — create, import, clone, reinstall; change type/version; world reset and upload; live console and power controls; join card (copy/QR); seed map + optional BlueMap.

**Resources** — RAM, CPU, and disk limits; live Docker stats; optional schedules (backup → restart → commands); crash auto-restart; owner alerts and Discord status webhooks.

**Files & access** — in-panel file manager; SFTP on port 2022 (`{username}.{serverId}`); subusers with invite links and scoped permissions.

**Content** — Modrinth plugins/mods and modpacks; recommended plugin stacks; optional CurseForge; one-click Geyser; Velocity/Bungee helpers.

**Data** — backups (manual and scheduled); per-server MySQL on the node.

**Platform** — registration with email verification; quotas (new accounts start at zero); optional TOTP; activity log and alerts; Client API keys; Mollie billing and Application API; license validation via `license.guartrix.com` (unlicensed free tier: 1 node, 1 server, 10 GB disk).

---

## Requirements

The installer targets **apt-based** Linux (Docker, Node.js 22).

| Distribution | Status |
|--------------|--------|
| **Ubuntu 24.04 LTS** | Recommended |
| Ubuntu 22.04 LTS | Supported |
| Debian 12 | Compatible in practice; not the primary test target |
| Other (RHEL, Fedora, Arch, …) | Not supported by the installer |

Use a clean VPS with a public IPv4 address (x86_64).

---

## Installation

Pick Ubuntu, install basics, **download** the installer, then run it.

### 1. OS

**Ubuntu 24.04 LTS** (recommended) or **22.04 LTS**, fresh VPS, public IPv4.

### 2. Download the installer

```bash
curl -Lo /tmp/guartrix-install.sh \
  https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install-panel.sh
```

### 3. Run it

```bash
sudo bash /tmp/guartrix-install.sh
```

The wizard configures role (full panel / panel-only / daemon-only), HTTP or HTTPS, MySQL, admin password, and license key.

**Automation** (flags, no full wizard):

```bash
sudo bash /tmp/guartrix-install.sh --full --http --ip YOUR.PUBLIC.IP
sudo bash /tmp/guartrix-install.sh --panel-only --http --ip YOUR.PUBLIC.IP
sudo bash /tmp/guartrix-install.sh --daemon-only \
  --token … --node-id … --ip NODE_IP --panel https://YOUR_PANEL
```

Guides: [Install the panel](docs/wiki/install-panel.md) · [Install nodes](docs/wiki/install-nodes.md)

### From a source checkout

```bash
cp .env.example .env   # configure secrets, PUBLIC_*, DATABASE_URL, LICENSE_*
npm install
npm run db:generate && npm run db:push
npm run build && bash scripts/start.sh
```

Environment reference: [env-reference.md](docs/wiki/env-reference.md)

---

## Architecture

```
Client ──HTTPS──► Web (:80 / :443) ──/api · /ws──► API (:3001, localhost)
                     │
                     └── static UI
API ──HTTP + WebSocket──► Daemon(s) (:8081) ──► Docker · SFTP (:2022) · MySQL
```

| Component | Responsibility |
|-----------|----------------|
| `apps/web` | React control panel |
| `apps/api` | Fastify API, sessions, Prisma (MySQL) |
| `apps/daemon` | Node agent HTTP API |
| `packages/node-agent` | Docker, files, SFTP, metrics, MySQL helper |
| `packages/shared` | Shared types, permissions, license verification |

Further reading: [Architecture](docs/wiki/architecture.md) · [Scaling](docs/wiki/scaling.md) · [Licensing](docs/wiki/licensing.md)

---

## Operations

```bash
npm run build          # compile (use build:release for minified shipping builds)
bash scripts/start.sh  # stop previous processes, health-check, start watchdog
```

| Port | Binding | Purpose |
|------|---------|---------|
| 80 / 443 | Public | Web UI (HTTP→HTTPS when TLS is enabled) |
| 3001 | Localhost | API (proxied by the web process) |
| 8081 | Localhost / node | Daemon |
| 2022 | Public (per node) | SFTP |
| 25565+ | Public | Game traffic |

Commercial packages: [Release builds](docs/wiki/release-builds.md) · day-to-day ops: [Operations](docs/wiki/operations.md) · [Security](docs/wiki/security.md)

### Accounts

- Bootstrap admin from `ADMIN_PASSWORD` when no users exist  
- Self-registration requires email verification  
- New operators receive **zero** server / RAM / database quota until an admin assigns limits  
- Without SMTP, outbound mail is written to `data/mail-outbox/`  

Details: [Accounts & quotas](docs/wiki/accounts-and-quotas.md)

### SFTP

| Field | Value |
|-------|--------|
| Username | `{panelUsername}.{serverId}` |
| Password | Panel account password |
| Port | **2022** |
| Protocol | SFTP (not FTP) |

See [SFTP](docs/wiki/sftp.md).

---

## Development

```bash
npm run dev:api      # API on :3001
npm run dev:web      # UI on :5173 (proxies /api)
npm run dev:daemon   # optional local daemon
```

Guide: [Development](docs/wiki/development.md)

---

## Documentation

| Topic | Document |
|-------|----------|
| Wiki index | [docs/wiki/README.md](docs/wiki/README.md) |
| UI tour | [panel-guide.md](docs/wiki/panel-guide.md) |
| Install panel / nodes | [install-panel.md](docs/wiki/install-panel.md) · [install-nodes.md](docs/wiki/install-nodes.md) |
| Architecture & scaling | [architecture.md](docs/wiki/architecture.md) · [scaling.md](docs/wiki/scaling.md) |
| Environment | [env-reference.md](docs/wiki/env-reference.md) |
| APIs | [client-api.md](docs/wiki/client-api.md) · [application-api.md](docs/wiki/application-api.md) · [OpenAPI](docs/openapi.yaml) |
| Licensing & releases | [licensing.md](docs/wiki/licensing.md) · [release-builds.md](docs/wiki/release-builds.md) |
| Security & ops | [security.md](docs/wiki/security.md) · [operations.md](docs/wiki/operations.md) |
| Roadmap | [docs/roadmap.md](docs/roadmap.md) |

---

## License

Copyright © 2026 Guartrix. All rights reserved.
