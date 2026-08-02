# Install the panel

Target: fresh **Ubuntu 24.04 LTS** (best) or **22.04 LTS** with a public IP. Optional domain + HTTPS (Cloudflare recommended). Debian 12 may work; other distros are not covered by the apt-based installer.

Installs **panel + local daemon + web** (+ MySQL via Docker). Does **not** install the
Guartrix license server — the panel uses `https://license.guartrix.com` by default.

## One-command install (GitHub)

### Interactive (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
```

No flags. The installer asks for:

1. **Role** — full panel / panel only (no daemon) / daemon only (game node)
2. Install directory (default `/opt/guartrix`)
3. Public IPv4 (auto-detected, editable)
4. HTTPS yes/no (default: HTTP via IP) — panel roles
5. Domain (if HTTPS) or optional hostname (if HTTP)
6. Admin password (blank = generate)
7. License key (blank = set later in Admin → License)
8. Panel MySQL: Docker (default) or existing server
9. Confirm summary → install

Daemon-only asks for token + node id from **System → Add node** instead of panel DB/HTTPS details.

(`scripts/install.sh` downloads `install-panel.sh` to `/tmp/guartrix-install.sh` and runs it under `script(1)` for a real TTY. Banner should show **v1.0.19+**.)

### HTTP only (flags / automation)

```bash
curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash -s -- \
  --http \
  --ip YOUR.PUBLIC.IP
```

Opens the panel at `http://YOUR.PUBLIC.IP`. No certificate needed.
`HTTPS_ENABLED=false`, `SESSION_SECURE=false`, `TRUST_PROXY=false`.

### HTTPS (domain + TLS)

```bash
curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash -s -- \
  --https \
  --domain your.domain.com \
  --ip YOUR.PUBLIC.IP
```

Passing any flag skips the full wizard; unset values may still be prompted when a TTY is available.
Set `GUARTRIX_NONINTERACTIVE=1` to never prompt.

### Panel MySQL

**Docker (default)** — installer starts `guartrix-mysql` on `127.0.0.1:3306` and writes `DATABASE_URL`.
On re-install it reuses the password from the existing container (MySQL only applies `MYSQL_PASSWORD` on first volume init).

```bash
curl -fsSL … | sudo bash -s -- --http --ip YOUR.PUBLIC.IP --mysql-docker
```

**Existing MySQL/MariaDB** — create an empty database + user first, then:

```bash
curl -fsSL … | sudo bash -s -- --http --ip YOUR.PUBLIC.IP \
  --mysql-external \
  --mysql-host 127.0.0.1 \
  --mysql-port 3306 \
  --mysql-database guartrix_panel \
  --mysql-user guartrix \
  --mysql-password 'YourDbPass'
# or: --database-url 'mysql://guartrix:YourDbPass@127.0.0.1:3306/guartrix_panel'
```

Env: `GUARTRIX_MYSQL_MODE=docker|external`, `GUARTRIX_DATABASE_URL`, `GUARTRIX_MYSQL_HOST`, …

If the panel DB already uses `127.0.0.1:3306`, the daemon’s **game-server** MySQL Docker is placed on **3307** so ports do not clash.

Non-interactive without `--https`/`--http`: HTTPS if `--domain` is a hostname; otherwise HTTP via IP.

Non-interactive env:

```bash
export GUARTRIX_HTTPS=0          # or 1 for HTTPS
export GUARTRIX_PUBLIC_IP=1.2.3.4
# export GUARTRIX_DOMAIN=your.domain.com   # required when GUARTRIX_HTTPS=1
export GUARTRIX_ADMIN_PASSWORD='YourStrongPass1!'
export GUARTRIX_LICENSE_KEY='GTRX-…'   # optional; can set later in Admin → License
curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
```

The script installs Docker, Node 22, clones to `/opt/guartrix`, writes `.env`
(`LICENSE_SERVER_URL=https://license.guartrix.com`),
sets up MySQL, builds, and enables systemd units (`guartrix-daemon`, `guartrix-api`,
`guartrix-web`).

### TLS (HTTPS mode only)

Place a Cloudflare Origin certificate:

- `/opt/guartrix/cert/<your-domain>.crt`
- `/opt/guartrix/cert/<your-domain>.key`

Or set `TLS_CERT_FILE` / `TLS_KEY_FILE` in `.env`. Without a trusted cert, the installer may fall back to self-signed (browsers will warn).

## Existing git checkout

```bash
cp .env.example .env
# Edit: ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_HOST, PUBLIC_IP,
# PUBLIC_BASE_URL, DATABASE_URL / MYSQL_*, SESSION_SECURE, TRUST_PROXY
# For HTTP/IP: HTTPS_ENABLED=false, SESSION_SECURE=false, TRUST_PROXY=false,
#   PUBLIC_BASE_URL=http://YOUR.IP
# For HTTPS: HTTPS_ENABLED=true, SESSION_SECURE=true, TRUST_PROXY=true,
#   PUBLIC_BASE_URL=https://your.domain
# LICENSE_SERVER_URL=https://license.guartrix.com
# LICENSE_KEY=GTRX-…

npm install
npm run db:generate
# Prisma CLI reads apps/api/.env — symlink to the panel root .env if needed:
#   ln -sfn ../../.env apps/api/.env
npm run db:push
npm run build
bash scripts/start.sh
```

Requirements: Node **22+**, Docker with passwordless `sudo docker`, image `eclipse-temurin:25-jre-jammy` (pulled on first start).

## After install

1. Open the URL printed by the installer (`http://IP` or `https://domain`) and sign in as `admin`.
2. Activate your license under **Admin → License** (if `LICENSE_KEY` was not passed to the installer).
3. Confirm Status / System shows the local node **ONLINE**.
4. Optionally harden the host: `bash scripts/install-host-hardening.sh`
5. Add remote capacity: [Install nodes](install-nodes.md)

## Related

- [Environment variables](env-reference.md)
- [Operations](operations.md)
- [Licensing](licensing.md) (customer key only — license server is operator-side)
