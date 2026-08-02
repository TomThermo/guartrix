# Install the panel

Target: fresh Ubuntu with a public IP and a domain pointing at that IP (Cloudflare recommended).

Installs **panel + local daemon + web** (+ MySQL via Docker). Does **not** install the
Guartrix license server — the panel uses `https://license.guartrix.com` by default.

## One-command install (GitHub)

```bash
curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash -s -- \
  --domain your.domain.com \
  --ip YOUR.PUBLIC.IP
```

(`scripts/install-panel.sh` is identical.)

Non-interactive:

```bash
export GUARTRIX_DOMAIN=your.domain.com
export GUARTRIX_PUBLIC_IP=1.2.3.4
export GUARTRIX_ADMIN_PASSWORD='YourStrongPass1!'
export GUARTRIX_LICENSE_KEY='GTRX-…'   # optional; can set later in Admin → License
curl -fsSL https://raw.githubusercontent.com/TomThermo/guartrix/main/scripts/install.sh | sudo bash
```

The script installs Docker, Node 22, clones to `/opt/guartrix`, writes `.env`
(`SKIP_LOCAL_LICENSE_SERVER=1`, `LICENSE_SERVER_URL=https://license.guartrix.com`),
sets up MySQL, builds, and enables systemd units (`guartrix-daemon`, `guartrix-api`,
`guartrix-web`).

### TLS

Place a Cloudflare Origin certificate:

- `/opt/guartrix/cert/guartrix.com.crt`
- `/opt/guartrix/cert/guartrix.com.key`

Or set `TLS_CERT_FILE` / `TLS_KEY_FILE` in `.env`. Without a trusted cert, the installer may fall back to self-signed (browsers will warn).

## Existing git checkout

```bash
cp .env.example .env
# Edit: ADMIN_PASSWORD, SESSION_SECRET, PUBLIC_HOST, PUBLIC_IP,
# PUBLIC_BASE_URL, DATABASE_URL / MYSQL_*, SESSION_SECURE, TRUST_PROXY
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

1. Open `https://your.domain.com` and sign in as `admin`.
2. Activate your license under **Admin → License** (if `LICENSE_KEY` was not passed to the installer).
3. Confirm Status / System shows the local node **ONLINE**.
4. Optionally harden the host: `bash scripts/install-host-hardening.sh`
5. Add remote capacity: [Install nodes](install-nodes.md)

## Related

- [Environment variables](env-reference.md)
- [Operations](operations.md)
- [Licensing](licensing.md) (customer key only — license server is operator-side)
