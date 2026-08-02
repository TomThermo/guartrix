# Licensing

Guartrix panels validate against a small **license server** so you can sell
self-hosted installs and revoke or expire licenses.

## Is it standalone?

**Yes.** The license server is a **separate** Node/Fastify package — a sibling
operator checkout at `../guartrix-license-server` (override with
`LICENSE_SERVER_HOME`). It is **not** part of this panel GitHub repo.

It has its own JSON store (`data/licenses/licenses.json`) and does **not** share
MySQL, Prisma, or session auth with the panel API. The panel only talks to it
over HTTP:

`POST /v1/validate` with `{ key, installId, publicHost? }`.

Customer / panel hosts use the public API:

`LICENSE_SERVER_URL=https://license.guartrix.com`

You can also point a panel at another host via **Admin → License → License server URL**.

## Security (honest)

| Control | Reality |
|---------|---------|
| Process isolation | Separate binary/port; no panel DB access |
| Admin console | Login with `LICENSE_ADMIN_SECRET` (Bearer); rate-limited |
| Default bind | API `0.0.0.0:4040` (public validate); UI **`127.0.0.1:4041`** (console local-only — do not expose) |
| Validate API | **Unauthenticated** by design (panels call it with a key) |
| Responses | **Ed25519 signed** (`claims` + `signature`); panel rejects unsigned unless `LICENSE_ALLOW_UNSIGNED=1` |
| Keys file | Plain JSON on disk (`0600`) — protect the host / backups |

For a **remote** license server: put **HTTPS** in front, keep the admin UI firewalled
or VPN-only, use a **long random** `LICENSE_ADMIN_SECRET`, and prefer
`LICENSE_SERVER_HOST=127.0.0.1` behind a reverse proxy rather than binding
`0.0.0.0` openly.

This is a **commercial control plane**, not DRM. Use
[release builds](release-builds.md) (esbuild minify + no sources in the customer
tarball) as a soft barrier; a determined attacker with a patched panel can still
skip checks.

## Components

| Piece | Role |
|-------|------|
| **License server** (`guartrix-license-server`) | Validate API on **:4040**; admin web UI on **:4041** (separate) |
| **Panel API** | Polls `/v1/validate`; on expiry stops all Minecraft servers and blocks start/restart |
| **Panel Admin → License** | Status, license key, **license server URL**, revalidate |

The **website/panel UI stays online** when a license expires; only game servers are stopped.

**End users** are not shown a license banner. When they try to **start/restart**, a red line appears in the **server console** asking them to contact an administrator. Admins still see a banner and use **Admin → License**.

## Quick start (operator host with sibling checkout)

1. Checkout **`guartrix-license-server`** next to the panel (or set `LICENSE_SERVER_HOME`).
2. Build that package (`dist/index.js`) and copy **`license.env.example` → `data/license.env`** (on the license host / shared `data/`) with `LICENSE_ADMIN_SECRET` (+ ports/URL).
3. Panel `.env`: **`LICENSE_SERVER_URL`**, **`LICENSE_KEY`**, and for a co-located license process set `SKIP_LOCAL_LICENSE_SERVER=0` (customers default to `1`).
4. `bash scripts/start.sh` starts `$LICENSE_SERVER_HOME/dist/index.js` with `GUARTRIX_PANEL_ROOT` when local mode is on.
5. Admin console: **http://127.0.0.1:4041/** — sign in with `LICENSE_ADMIN_SECRET`. Not linked from the panel UI.
6. Panel **Admin → License** shows status and can change server URL / key.

## Remote / public license server (customers)

1. Deploy `guartrix-license-server` on the central host with its own **`data/license.env`** (`node dist/index.js`, or your own systemd unit).
2. Set `LICENSE_SERVER_HOST` / TLS as needed; store keys under that host’s `data/licenses/`.
3. On each panel: **Admin → License** → set **License server URL** to
   `https://license.yourdomain.com` (saved under `data/license-server-url`), **or**
   set `LICENSE_SERVER_URL=https://license.guartrix.com` in the panel `.env`.
4. Panel hosts that should not run a local copy (all customer installs):
   `SKIP_LOCAL_LICENSE_SERVER=1` in the panel `.env` (start.sh / watchdog skip the local process).

## Console features

Dark Bootstrap admin UI on **:4041** (CSS/JS served **locally** from `public/vendor/` — no CDN):

- Stats: issued / active / online / expired+revoked
- Create/edit with presets: **1 day**, **1 month**, **1 year**, **unlimited**, or custom date
- Quotas: max nodes, bound IPs, max MC servers, total / per-server RAM (GB in UI)
- **Panel features**: toggle permission groups (file/SFTP, backups, addons, …)
- **Revoke** (soft) and **Delete** (permanent); copy key; Unbind IP; toasts for feedback

## Versioning & updates

Product version lives in the panel root **`VERSION`** file (semver, e.g. `1.0.0`). API
and daemon report it; the license server reports its own package version.

The **license server** publishes a release channel (`data/licenses/channel.json`):

| Field | Meaning |
|-------|---------|
| `latestVersion` | Newest build customers should run |
| `minVersion` | Optional floor (panels below this show a warning) |
| `notes` | Short message shown in the panel |

Edit the channel in the **license console** (Release channel card), or:

`GET/PUT /v1/admin/channel` · public `GET /v1/latest`

Each panel sends `panelVersion` and **`publicIp`** (`PUBLIC_IP`) on
`POST /v1/validate`. Admins see **System version** on **Statusline** and
**Admin → License** (`GET /api/admin/version`).

### Security (anti-bypass)

Signed responses, binding, and fail-closed behaviour protect **unmodified** panels.
Self-hosted Node can always be patched by a determined attacker — this is commercial
control, not DRM.

| Control | Behaviour |
|---------|-----------|
| Ed25519 signatures | `/v1/validate` returns `claims` + `signature`; panel rejects unsigned/forged JSON unless `LICENSE_ALLOW_UNSIGNED=1` |
| Public key | Auto `data/licenses/signing-public.pem`, or `LICENSE_VERIFY_PUBLIC_KEY` / `GET /v1/public-key` |
| IP bind | Public TCP peer wins; body `publicIp` only when peer is private/loopback |
| Install seat | `installId` locked until **Unbind** |
| Unreachable | Soft-valid only within `LICENSE_UNREACHABLE_GRACE_MS` (default 24h), then invalid + stops |
| Validate interval | Panel background check every `LICENSE_VALIDATE_INTERVAL_MS` (default **10 minutes**) |
| Admin License page | Force-validates on load / save / Revalidate, and every 60s while the page is open |
| Rate limit | Per IP / minute (env-tunable): validate **30**, admin login **5**, public endpoints **60**, admin probe **20**, admin API **120** |
| Admin console | Strong `LICENSE_ADMIN_SECRET` required; UI defaults to localhost; login rate-limited; UI→API forwards client IP for limits |
| Starts | All JVM starts (API, boot, schedule, backup, transfer) go through license checks |

### IP binding (one activation)

On the **first successful validate** with a bindable IP, the key is **bound** to
that IP and install (`boundIp` / `lastInstallId` in `licenses.json`).

| Situation | Result |
|-----------|--------|
| Same IP + install validates again | Allowed |
| Different IP or install | Rejected (`status: in_use`) |
| Admin clears binding | **Unbind**, or clear **Bound IP** in Edit → key free for a new IP |
| Admin sets / changes IP | Edit → **Bound IP** (empty = unbound). Next validate must match that IP |

Set `PUBLIC_IP` correctly on each panel host (needed when the panel reaches the
license API via localhost). Loopback alone cannot activate a new key.

Bump `VERSION` when you ship a customer build, then set `latestVersion` on the
license host to the same value so panels show “Up to date”.

### Panel quotas (per license)

Each license can set commercial ceilings for the whole panel install:

| Field | Meaning |
|-------|---------|
| `maxNodes` | Max daemon nodes on that panel (`null` = unlimited) |
| `boundIps` | Allowed IPs (max length = `maxNodes` when set). Panel must validate from one of these |
| `maxServers` | Max Minecraft servers on that panel (`null` = unlimited) |
| `maxMemoryMb` | Total RAM pool (stored as MB; console edits in **GB**) |
| `maxMemoryMbPerServer` | Optional cap for a single MC server (stored MB; console **GB**) |

Set these in the license console (create/edit form). Example: max nodes `2` with two
IPs listed → two daemons allowed, panel may activate from either IP.

The panel enforces quotas on create / clone / import / memory change / **start** /
**restart** / boot-start / **add node** (in addition to per-user account quotas).
A server already set above the per-server cap cannot start until Memory is lowered.

**Admin → License** shows allowance vs current panel usage (nodes, servers, RAM).

### Panel features (per license)

Each license can enable or disable the same **permission groups** used for subusers
(power, file manager / SFTP, backups, databases, schedules, players, addons, …).

| Value | Meaning |
|-------|---------|
| `features: null` | All groups enabled (default for new licenses) |
| `features: []` | Nothing enabled |
| `features: ["file","backup",…]` | Only those groups |

The panel intersects every user’s effective permissions (including owners and admins)
with the license ceiling. Disabling **File** blocks the file manager and SFTP;
disabling **Backup** hides backup APIs; etc.

Toggle groups in the license console under **Panel features** (All / None + checkboxes).
After save, **Revalidate** on the panel (or wait for the next validate cycle).

The license admin console is a small dark Bootstrap UI on `LICENSE_UI_PORT`
(default **4041**). CSS/JS (Bootstrap + Font Awesome) are **served locally** from
`public/vendor/` in the license-server package — no CDN required.

## Env

- **Panel:** `LICENSE_SERVER_URL`, `LICENSE_KEY`, `LICENSE_INSTALL_ID`, `SKIP_LOCAL_LICENSE_SERVER`, optional `LICENSE_SERVER_HOME` — [env-reference](env-reference.md).
- **License server:** `data/license.env` from `license.env.example` in the **guartrix-license-server** package (also published on `/download` for operators).

## Operator notes

- To extend a license: open the license console on the license host → Edit → new duration.
- To force-expire for testing: set custom expiry in the past, then **Revalidate** in the panel.
- URL priority: Admin override file → `LICENSE_SERVER_URL` env → `https://license.$PUBLIC_HOST` (fallback `https://license.guartrix.com`).
- **Backups:** `bash scripts/backup-licenses.sh` (store + signing keys → `data/backups/licenses/`). Daily timer: `sudo bash scripts/install-license-backup-cron.sh`.
- **Customers:** ship only [release tarballs](release-builds.md) — never this source checkout or the license-server package.
- **Per customer key** (license console): set max nodes / bound IPs / server+RAM quotas / panel features before sending the key.

### HTTPS for `license.guartrix.com` (customer validate)

Cloudflare’s proxied (orange) mode often returns a bot-challenge HTML page to
server-to-server `/v1/validate`, which the panel rejects as an unsigned response.

**Working setup on this host:**

| Piece | Value |
|-------|--------|
| DNS | Cloudflare **A** `license` → origin IP, **DNS only** (grey cloud) |
| TLS | Let’s Encrypt via DNS-01 (`sudo bash scripts/install-license-le-cert.sh`) |
| Origin bind | `LICENSE_SERVER_HOST=127.0.0.1` (API only on loopback) |
| Proxy | prod-web `:443` Host `license.*` → `127.0.0.1:4040` with **SNI** LE cert |
| Panel | `LICENSE_SERVER_URL=https://license.guartrix.com` |

Certbot renew is automatic; a deploy hook restarts the panel so SNI reloads the cert.

Optional env overrides: `LICENSE_TLS_CERT_FILE` / `LICENSE_TLS_KEY_FILE` (default
`/etc/letsencrypt/live/license.guartrix.com/…`).

Keep **LICENSE_UI** on `127.0.0.1:4041` — do **not** expose the admin console publicly.

If you later get a Cloudflare token with WAF / Configuration Rules, you *may* orange-cloud
again and skip Bot Fight for `license.*` instead of DNS-only — LE SNI is still fine behind CF
Full (strict) only if the Origin cert also covers `license.*` (or use Universal SSL only).

### Admin console access (localhost UI)

```bash
ssh -L 4041:127.0.0.1:4041 user@license-host
# then open http://127.0.0.1:4041/
```
