# Install the panel

Target: fresh Ubuntu with a public IP. Optional domain + HTTPS (Cloudflare recommended).

Installs **panel + local daemon + web** (+ MySQL via Docker). Does **not** install the
Guartrix license server — the panel uses `https://license.guartrix.com` by default.

## One-command install (GitHub)

### HTTP only (server IP, no TLS)

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

(`scripts/install-panel.sh` is identical.)

Interactive installs (TTY) ask: **Use HTTPS with a domain? [y/N]** — default is HTTP/IP.

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
(`SKIP_LOCAL_LICENSE_SERVER=1`, `LICENSE_SERVER_URL=https://license.guartrix.com`),
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
# SKIP_LOCAL_LICENSE_SERVER=1

npm install
npm run db:generate
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
