# Install the panel

Guartrix Panel runs on your own VPS. You need root access or passwordless `sudo` on the target VPS.

This guide follows the same style as [Pterodactyl’s getting started](https://pterodactyl.io/panel/1.0/getting_started.html): pick an OS, install dependencies, download the installer, run it.

## Picking a Server OS

| Operating System | Version | Supported | Notes |
|------------------|---------|-----------|--------|
| **Ubuntu** | **24.04 LTS** | Yes | **Recommended** |
| Ubuntu | 22.04 LTS | Yes | Supported |
| Debian | 12 | Yes* | Same `apt` flow; not primary QA |
| Other (RHEL, Fedora, Arch, OpenVZ, …) | — | No | Not supported by the installer / Docker path |

Use a **fresh x86_64 VPS** with a public IPv4 address. Avoid OpenVZ if Docker is restricted.

## Dependencies

The installer installs these for you when missing. To prepare the host yourself:

```bash
sudo apt update
sudo apt -y install ca-certificates curl gnupg git openssl ufw python3
# Docker + Node 22 are installed automatically by the installer if absent.
```

You also need:

- Docker (Engine) with permission to run containers  
- Node.js **22+**  
- A public IP (and optionally a domain + TLS cert for HTTPS)

## Download files

**Do not** pipe the script into bash as your primary method. Download it first (like Pterodactyl’s `curl -Lo panel.tar.gz`), then run it:

```bash
curl -Lo /tmp/guartrix-install.sh \
  https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install-panel.sh
```

## Installation

```bash
sudo bash /tmp/guartrix-install.sh
```

The interactive wizard asks for:

1. **Role** — full panel / panel only (no daemon) / daemon only (game node)  
2. Install directory (default `/opt/guartrix`)  
3. Public IPv4 (auto-detected, editable)  
4. HTTPS yes/no (default: HTTP via IP) — panel roles  
5. Domain (if HTTPS) or optional hostname (if HTTP)  
6. Admin password (blank = generate)  
7. License key (blank = the panel runs the **free tier**: 1 node, 1 server, 10 GB disk — set a key later in Admin → License)  
8. Panel MySQL: Docker (default) or existing server  
9. Redis (optional): skip / Docker `guartrix-redis` / external URL  
10. Confirm summary → install  

Daemon-only asks for token + node id from **System → Add node** instead of panel DB/HTTPS details.

The script installs Docker/Node if needed, clones to `/opt/guartrix`, writes `.env`
(`LICENSE_SERVER_URL=https://license.guartrix.com`), sets up MySQL (and optional Redis), builds, and enables
systemd units (`guartrix-daemon`, `guartrix-api`, `guartrix-web`).

Implementation references:

- [Build and release internals](build-and-release-internals.md)
- [Prod-web and downloads](prod-web-and-downloads.md)
- [Daemon API](daemon-api.md)
- [License flow internals](license-flow-internals.md)

### Shortcut entrypoint (optional)

Same installer, via a tiny wrapper (still **download then run**):

```bash
curl -Lo /tmp/install.sh \
  https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh
sudo bash /tmp/install.sh
```

### HTTP only (flags / automation)

```bash
sudo bash /tmp/guartrix-install.sh --http --ip YOUR.PUBLIC.IP
```

Opens the panel at `http://YOUR.PUBLIC.IP`. No certificate needed.
`HTTPS_ENABLED=false`, `SESSION_SECURE=false`, `TRUST_PROXY=false`.

### HTTPS (domain + TLS)

```bash
sudo bash /tmp/guartrix-install.sh \
  --https \
  --domain your.domain.com \
  --ip YOUR.PUBLIC.IP
```

Passing any flag skips the full wizard; unset values may still be prompted when a TTY is available.
Set `GUARTRIX_NONINTERACTIVE=1` to never prompt.

### Panel MySQL

**Docker (default)** — installer starts `guartrix-mysql` on `127.0.0.1:3306` and writes `DATABASE_URL`.
On a **full** install (panel + local daemon) this same container/volume is reused for **per-server game databases**. Recreating the volume (`data/mysql`) wipes panel **and** game DBs.
On re-install it reuses the password from the existing container (MySQL only applies `MYSQL_PASSWORD` on first volume init). If credentials no longer match, it recreates the container + data volume.

```bash
sudo bash /tmp/guartrix-install.sh --http --ip YOUR.PUBLIC.IP --mysql-docker
```

**Existing MySQL/MariaDB** — create an empty database + user first, then:

```bash
sudo bash /tmp/guartrix-install.sh --mysql-external --mysql-host 10.0.0.5 \
  --mysql-user guartrix --mysql-password '…' --mysql-database guartrix_panel
```

If external panel MySQL is already on **localhost:3306**, the installer publishes game MySQL Docker on host port **`3307`** so the two do not clash (`MYSQL_PORT` in `data/daemon.env`).

Game DB UI: [Databases](databases.md).

### Optional Redis (multi-API HA)

**Skip (default)** — single panel API; file sessions and rate limits.

**Docker** — installer starts `guartrix-redis` on `127.0.0.1:6379` and sets `REDIS_URL`, `SESSION_STORE=redis`, `RATE_LIMIT_STORE=redis`.

```bash
sudo bash /tmp/guartrix-install.sh --redis-docker
```

**External** — point at an existing Redis:

```bash
sudo bash /tmp/guartrix-install.sh --redis-external --redis-url 'redis://10.0.0.5:6379/0'
```

See [Scaling](scaling.md) for what Redis covers (sessions, rate limits, transfers, scheduler lock, event bus).

### Flags / automation

Passing any flag skips the full wizard; unset values may still be prompted when a TTY is available.
Set `GUARTRIX_NONINTERACTIVE=1` to never prompt.

| Flag | Purpose |
|------|---------|
| `--role full\|panel\|daemon` | Install role (`--full` / `--panel-only` / `--daemon-only` / `--no-daemon` aliases) |
| `--domain HOST` · `--ip ADDR` | Public hostname / IPv4 |
| `--https` · `--http` / `--no-https` | TLS mode |
| `--mysql-docker` · `--mysql-external` · `--mysql-host/port/database/user/password` · `--database-url` | Panel DB |
| `--redis-docker` · `--redis-external` · `--redis-url` · `--redis-skip` / `--no-redis` | Optional Redis |
| `--admin-password` · `--license-key` | First admin + license (password is written as given; enforce strength yourself) |
| `--token` · `--node-id` · `--panel` · `--daemon-port` | Daemon-only role |
| `--dir` · `--repo` · `--branch` · `--skip-start` | Install location, git source, skip process start |
| `-h` / `--help` | Full help |

Env overrides (non-interactive): `GUARTRIX_NONINTERACTIVE`, `GUARTRIX_HTTPS`, `GUARTRIX_PUBLIC_IP`, `GUARTRIX_DOMAIN`, `GUARTRIX_ADMIN_PASSWORD`, `GUARTRIX_LICENSE_KEY`, `GUARTRIX_INSTALL_DIR`, `GUARTRIX_REPO_URL`, `GUARTRIX_BRANCH`, `GUARTRIX_INSTALL_ROLE`, `GUARTRIX_MYSQL_*`, `GUARTRIX_REDIS_*`, `GUARTRIX_DAEMON_*`.

```bash
sudo bash /tmp/guartrix-install.sh --http --ip YOUR.PUBLIC.IP \
  --mysql-external \
  --mysql-host 127.0.0.1 \
  --mysql-port 3306 \
  --mysql-database guartrix_panel \
  --mysql-user guartrix \
  --mysql-password 'YourDbPass'
```

### Non-interactive env example

```bash
export GUARTRIX_NONINTERACTIVE=1
export GUARTRIX_HTTPS=0
export GUARTRIX_PUBLIC_IP=1.2.3.4
export GUARTRIX_ADMIN_PASSWORD='YourStrongPass1!'
export GUARTRIX_LICENSE_KEY='GTRX-…'   # optional
sudo bash /tmp/guartrix-install.sh
```

### Firewall (UFW)

When UFW is available, the installer opens:

| Port | When |
|------|------|
| `22/tcp` (or OpenSSH profile) | Always |
| `80/tcp` | Always |
| `443/tcp` | HTTPS installs |
| `2022/tcp` · `25565:25600/tcp` | Local daemon present (`full` role; not panel-only) |

### TLS (HTTPS mode only)

The installer **does not** run Certbot / Let’s Encrypt for the panel. Place a certificate you already have (typically a **Cloudflare Origin** cert):

- `/opt/guartrix/cert/<your-domain>.crt`
- `/opt/guartrix/cert/<your-domain>.key`

Or set `TLS_CERT_FILE` / `TLS_KEY_FILE` in `.env`. Without a trusted cert, **prod-web** may fall back to a self-signed cert on start (browsers will warn).

Separate helpers (not part of the panel wizard): `scripts/install-daemon-le-cert.sh`, `scripts/install-download-le-cert.sh` (`LETSENCRYPT_EMAIL`).

## Existing git checkout

```bash
cp .env.example .env
# Edit: ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_HOST, PUBLIC_IP,
# PUBLIC_BASE_URL, DATABASE_URL / MYSQL_*, SESSION_SECURE, TRUST_PROXY
# LICENSE_SERVER_URL=https://license.guartrix.com
# LICENSE_KEY=GTRX-…

npm install
npm run db:generate
# Prisma CLI reads apps/api/.env — symlink if needed:
#   ln -sfn ../../.env apps/api/.env
bash scripts/db-migrate.sh
npm run build
bash scripts/start.sh
```

Requirements: Node **22+**, Docker with passwordless `sudo docker`, image `eclipse-temurin:25-jre-jammy` (pulled on first start).

## After install

1. Open the URL printed by the installer (`http://IP` or `https://domain`) and sign in as `admin`.  
2. Activate your license under **Admin → License** (if `LICENSE_KEY` was not passed). Until then the [free tier](licensing.md#free-tier-no-valid-license) applies: 1 node, 1 server, 10 GB disk.  
3. Confirm **Admin → Status** shows the local node **ONLINE** ([Status overview](statusline.md)).  
4. Optionally harden the host: `bash scripts/install-host-hardening.sh`  
5. Add remote capacity: [Install nodes](install-nodes.md)

Systemd units (when enabled): `guartrix-api`, `guartrix-web`, `guartrix-daemon` — see [Operations](operations.md).

## Related

- [Environment variables](env-reference.md)  
- [Operations](operations.md)  
- [Licensing](licensing.md)
- [Databases](databases.md)
- [Build and release internals](build-and-release-internals.md)
