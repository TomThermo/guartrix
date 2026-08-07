# Changelog

All notable changes to Guartrix are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.3.16] — 2026-08-07

### Added

- Cloudflare Turnstile (“I'm not a robot”) on login and registration — toggle + keys under **Admin → Settings → Security** (or `TURNSTILE_*` env); Go-live readiness warn when registration is open without Turnstile; CSP allows `challenges.cloudflare.com`.

## [1.3.15] — 2026-08-07

### Changed

- Refreshed all wiki screenshots at fixed **1440×900** via demo admin (`scripts/ensure-demo-admin.mjs`, no 2FA banner).
- Added `38-admin-servers.png` / `39-admin-settings.png`; capture script defaults to local demo login.

## [1.3.14] — 2026-08-07

### Changed

- Docs/wiki/README sync against Admin → Servers, Settings → Backup, read-only Backups-tab keep limit, and screenshot refresh checklist.
- Capture script shots for `/admin/servers` and `/admin/settings`.

## [1.3.13] — 2026-08-07

### Changed
- Admin → Settings: section nav moved to top horizontal pills (same pattern as Status tabs)

## [1.3.12] — 2026-08-07

### Fixed
- Admin → Status Nodes container table: dark-mode friendly header/row colors (no Bootstrap light `table-secondary`)

## [1.3.11] — 2026-08-07

### Changed
- Admin → Status: tabbed layout (Overview / Nodes / Logs) with denser tiles and service pills

## [1.3.10] — 2026-08-07

### Added
- Admin sidebar badges: server / node / user counts next to Servers, Nodes, and Users

## [1.3.9] — 2026-08-07

### Added
- Admin → Nodes **Advanced Settings**: UUID, tags, upload limit, daemon base directory, SFTP port/alias, deployable + maintenance mode, memory/disk/CPU limits with overallocate

## [1.3.8] — 2026-08-07

### Changed
- Admin → Nodes Basic Settings: full-width denser layout with identity grid, connect URL preview tile, and SSL mode cards

## [1.3.7] — 2026-08-07

### Changed
- Admin → Nodes Overview: denser dashboard layout (info tiles + side-by-side live stats, larger centered disk pie, charts below)

## [1.3.6] — 2026-08-07

### Added
- Admin → Nodes Overview: console-style live charts for host CPU, memory, and network in/out (daemon reports NIC totals from `/proc/net/dev`)

## [1.3.5] — 2026-08-07

### Changed
- Admin → Nodes Basic Settings: wider layout; SSL mode as three toggle buttons instead of a dropdown

## [1.3.4] — 2026-08-07

### Added
- Admin → Nodes **Configuration File** tab: copy `daemon.env`, auto-deploy command, reset authorization token, and Install via SSH (Pterodactyl/Pelican-style manual install)

## [1.3.3] — 2026-08-07

### Added
- Admin → Nodes **Basic Settings**: display name, domain (+ DNS validation), connect port, SSL mode (HTTP / HTTPS / HTTPS with reverse proxy), `behindProxy` on nodes
- `GET /api/admin/dns-lookup` for hostname resolution hints

## [1.3.2] — 2026-08-07

### Added
- Admin → Nodes fullscreen Overview: live daemon host stats (version, CPU threads/arch/kernel, CPU & memory bars, storage pie chart) via `GET /api/admin/nodes/:id/status` (polls every 5s)

## [1.3.1] — 2026-08-07

### Fixed
- Admin Settings Misc / Go-live tab icons (`fa-ellipsis`, `fa-rocket`) missing from Font Awesome production safelist

### Changed
- **Admin → Nodes**: full-width compact table (health / reachable / name / address / SSL / type / servers) instead of half-width cards; open a row for a fullscreen editor (Overview · Settings · Allocations)

## [1.3.0] — 2026-08-07

### Added

- **Admin → Settings** Pelican-style expansion: branding (app name / logo / favicon), Backup tab, Misc (debug, unit prefix, nav preference, display width), trusted proxies (+ Cloudflare IP preset) on Security.
- Public `GET /api/public/branding` drives navbar title, favicon, and layout width.

### Changed

- Settings tabs: General · Mail · Backup · Security · Misc · Alerts · Go-live.

## [1.2.9] — 2026-08-07

### Changed

- **Admin panel:** single top-nav **Admin** button opens a dedicated admin area with a left sidebar (Status, Servers, Settings, Nodes, License, Activity, Billing, Users) instead of a dropdown of loose links. `/users` and `/statusline` redirect into `/admin/…`.

## [1.2.8] — 2026-08-07

### Changed

- **Backups tab:** removed the long help banner and the retention editor; shows the keep limit read-only. Retention is set in **Admin → Servers** (or at create-server time).

## [1.2.7] — 2026-08-07

### Changed

- **Settings → Performance:** Memory / Disk / CPU fields are admin-only (hidden for non-admins). View distance, simulation, compression, and tick time stay available to users with settings permission.

## [1.2.6] — 2026-08-07

### Changed

- **Admin → Servers** (was “Server backups”) — searchable table of all servers with edit modal for name, owner, RAM/disk/CPU, suspend, and backup retention; link to full server settings for world/startup/mounts.
- **Backups tab:** retention block uses theme background (`bg-body-tertiary`) so it follows dark mode.

## [1.2.5] — 2026-08-07

### Added

- **Admin → Server backups** — list all servers and edit per-server backup retention; set panel default for new servers.
- **Create server** — choose max backups when provisioning or importing.
- Panel setting `defaultBackupKeepCount` (+ env `DEFAULT_BACKUP_KEEP_COUNT`).

## [1.2.4] — 2026-08-07

### Changed

- **Backups:** per-server retention limit (`keepCount`) moved to a dedicated **Backup retention** block on the Backups tab (was hidden inside the automatic schedule form).

## [1.2.3] — 2026-08-07

- Web footer shows product version (`vX.Y.Z` from `VERSION` at build time)

## [1.2.2] — 2026-08-07

- Docs sync: README SaaS/SLA hub, upgrade-to-1.2, in-app wiki Go-live/SLA/transfer/API v1

## [1.2.1] — 2026-08-07

- Ops pack: SLA contract template, Prometheus alert example, drill log example
- `sla-restore-drill.sh --restore-latest` (compose MySQL staging) + scale-smoke HA/metrics probes

## [1.2.0] — 2026-08-07

- SaaS harden: `REQUIRE_REDIS_HA`/`PANEL_HA` refuses boot without Redis+BullMQ+redis stores
- Transfers peer-only by default (`TRANSFER_ALLOW_PANEL_STAGING=0`); panel staging opt-in
- Owner aggregate API rate limit (`API_OWNER_RATE_LIMIT`); `RATE_LIMITED` error code
- BullMQ disk-watch ticks; Go-live secret-rotation attestation + transfer staging check
- CI: MySQL+Redis integration job, Playwright secret mapping, expanded Biome SaaS paths
- Ops: `scripts/sla-restore-drill.sh`, `scripts/sla-secret-rotation-drill.sh`, [pentest-scope](docs/wiki/pentest-scope.md)

## [1.1.3] — 2026-08-07

- Fix `/api/v1` dual-mount: use Fastify `rewriteUrl` so routes resolve (onRequest rewrite was too late for the router)

## [1.1.2] — 2026-08-06

- Sprint 10 SaaS/SLA: invite accept requires `emailVerified`; Admin → Settings → Go-live readiness + SLA attestations
- BullMQ job queues when Redis is configured; scheduler lock fail-closed on Redis errors
- Stable `/api/v1` dual-mount; peer MySQL restore-from on node transfer
- CI Biome on Sprint 10 paths + optional Playwright staging workflow; SLA ops wiki

## [1.1.1] — 2026-08-06

- Docs sync: README capabilities + wiki Contents regroup; stats history, pagination, BackupSchedule notes; in-app Bedrock + upgrade-to-1.1
- Operator-only promo docs index lives under `data/promo-docs/` (never published to GitHub)

## [1.1.0] — 2026-08-06

### Scale-ready minor

- Mark 100n/1000c control-plane **green** (fases 1–4 from 1.0.165–1.0.168)
- MySQL: `Server` list indexes on `createdAt` and `(ownerId, createdAt)`
- Session rate limits: separate `API_SESSION_READ_RATE_LIMIT` for dashboard poll GETs
- Docs: [upgrade-to-1.1.md](docs/wiki/upgrade-to-1.1.md), sizing section, api-conventions pagination/rate-limit fixes
- Ops: `scripts/scale-smoke.sh` readiness check

## [1.0.168] — 2026-08-06

- Scale fase 4: daemon `/events` single-primary via Redis `guartrix:bridge:lock` + Redis fan-out
- Reconnect exponential backoff, jitter, and connect stagger (no panel-restart storm)
- Env: `DAEMON_BRIDGE_*` knobs

## [1.0.167] — 2026-08-06

- Scale fase 3 complete: backup/restore busy lock via Redis SET NX + TTL (local Set without Redis)
- Env: `BACKUP_BUSY_TTL_MS`

## [1.0.166] — 2026-08-06

- Removed Mineflayer admin bots (API worker, UI tab, deps, wiki, OpenAPI)
- Scale phase 3: daemon-side stats history (panel proxies); node→node transfer via `deploy-from` with panel staging fallback
- Roadmap: bots cancelled; stats + transfers marked done

## [1.0.165] — 2026-08-06

- Scale phase 1: due scheduled tasks + backup schedules via indexed DB queries (BackupSchedule model); disk-watch paged/concurrent + lock
- Scale phase 2: paginated GET /api/servers + Application users/servers; Admin Status cache; dashboard Load more
- Env: SCHEDULER_*_BATCH, DISK_WATCH_PAGE/CONCURRENCY, ADMIN_STATUS_* knobs

## [1.0.164] — 2026-08-06

- Scorecard ≥99 push: coverage floor 95% on expanded security/helpers; OpenAPI + critical audit in CI; locale EN/NL parity test
- Security: billing webhook via fetchSafeWebhook; SSRF notes in security wiki
- Ops: start.sh refuses active guartrix systemd units (ALLOW_MIXED_SUPERVISION escape); ops docs single-supervision model
- Clean/UX: peel in-app wiki into articles/*; BotsPanel polls via useVisibleInterval
- Docs: roadmap hygiene → v1.0.163+; env-reference SMTP/Cloudflare/MySQL gaps filled

## [1.0.163] — 2026-08-06

- Docs audit: OpenAPI/roadmap sync; development (coverage + NL lazy-load); billing/license/daemon/backup internals; README ops smoke + preseed; in-app wiki mirror
- Rules: always commit+push when done (`always-commit-push.mdc`); rebuild/docs rules aligned

## [1.0.162] — 2026-08-06

- Scorecard all dimensions ≥95: coverage floor 75% + JWT/authz/file-jail tests; install preseed tips; NL locale lazy-load + vendor manualChunks
- Wiki: security JWT defaults, install-nodes preseed checklist, operations health smoke

## [1.0.161] — 2026-08-06

- Code-schoonheid peels: jars, billing, license store/watcher, transfer jobs, backup mysql/offsite/paths, auth session register/password
- Web: split `api/servers` into domain modules; AddonDetail tab bodies into `addon-panel/`

## [1.0.160] — 2026-08-06

- Fix file browser row layout: desktop keeps 5 columns; Fold compact 4-col no longer overrides landscape monitors

## [1.0.159] — 2026-08-06

- Runtime speed: prod-web gzip/brotli + ETag; API `@fastify/compress`; SW cache-first for hashed `/assets/*`
- Defer Monaco until file editor opens; dashboard polls stats/online every 15s and full list every ~60s
- `SERVER_LIST_FS_CACHE_MS` for list `hasIcon`/`whitelistEnabled`; server icon `Cache-Control: private, max-age=60`

## [1.0.158] — 2026-08-06

- Session API rate limit keyed by **userId** (NAT-safe); security test floor + CI coverage gate
- Peel `daemon-client` into domain modules; extract bot-controls + backup-schedule
- `DISK_USAGE_CACHE_MS` / `DISK_WATCH_INTERVAL_MS` env knobs; OpenAPI/CHANGELOG/roadmap sync
- Extra Playwright authz smokes; install-nodes supply-chain hardening notes

## [1.0.157] — 2026-08-06

- Security: SSRF DNS-pin on outbound fetches; MySQL `remote:%` rejected; root password via `--defaults-extra-file`; `extraMounts` admin-only; remote-install panel password step-up; CSRF `timingSafeEqual`; wiki URL local-host block

## [1.0.156] — 2026-08-06

- Split node-agent (files/mysql/process), daemon routes, and large web modules

## [1.0.155] — 2026-08-06

- Extract user-quota helpers and split fat API routes

## [1.0.154] — 2026-08-06

- Block scoped-key admin escalation; CSRF always enforced for cookie sessions

## [1.0.153] — 2026-08-06

- Harden admin API authz and split route modules

## [1.0.136] — 2026-08-05

- Expand HTTP API, admin scopes, and API documentation (OpenAPI)

## [1.0.126]–[1.0.135] — 2026-08-05

- Panel UI refresh: design tokens, dashboard/console/admin shells, Fold layouts, create-server and account-security redesigns

## [1.0.117]–[1.0.125] — 2026-08-05

- IDE-style File Manager (Monaco); Fold/viewport layout polish; server detail header cards

## [1.0.116] — 2026-08-05

- File manager: files left + editor right again (viewport-sized textarea)

## [1.0.115] — 2026-08-05

- Side-by-side file manager (files left, editor right) with viewport-sized textarea; patch server.properties in place

## [1.0.114] — 2026-08-05

- Start syncs `server.properties` server-port to the panel port before boot (purple NOTICE)

## [1.0.113] — 2026-08-05

- Start syncs firewall + Docker ports after a port change; purple console NOTICE lines explain why

## [1.0.112] — 2026-08-05

- Console read-only permission, MySQL in backups, cron schedules, bulk dashboard actions, daemon/API rate limits, backup offsite UI

## [1.0.111] — 2026-08-05

- Console pop-out window fits viewport without page scroll

## [1.0.110] — 2026-08-05

- Console: open live console in a dedicated browser window (pop-out button on Console tab)
- Ops: Mollie webhook IP allowlist configured; `PANEL_URL` set to public panel URL for daemon firewall

## [1.0.109] — 2026-08-05

- Security: CSRF double-submit token, Bedrock safe extract + SHA256 verify, shared Docker gate, daemon panel-only firewall, Mollie webhook IP allowlist

## [1.0.108] — 2026-08-05

- Security: per_server Docker default everywhere, metrics Bearer-only, safer backup offsite placeholders, minimal invite peek

## [1.0.107] — 2026-08-05

- New servers auto-start after create, import, or clone; start on boot enabled by default

## [1.0.106] — 2026-08-05

- Bedrock Whitelist tab: correct allowlist.json format, Xbox gamertags, permissions.json ops

## [1.0.105] — 2026-08-05

- BDS: pre-build CA runtime image on daemon start; clearer console during first build
- Empty allowlist auto-disabled so Xbox players can join online-mode servers

## [1.0.104] — 2026-08-05

- BDS: custom Docker image with CA certificates so Microsoft online-services auth works (fixes hang on *Waiting for Minecraft services…*)

## [1.0.103] — 2026-08-05

- BDS: default `online-mode=true` again (Xbox verification); shared Docker network + host DNS for Microsoft auth

## [1.0.102] — 2026-08-05

- BDS offline boot: force `allow-list=false` (BDS rejects allowlist without online auth)

## [1.0.101] — 2026-08-05

- BDS boot: fix `Server started` log detection (timestamp prefix), default offline mode, LAN/raknet + DNS in container
- Startup migration sets `online-mode=false` on existing BDS servers; boot failure logs mark ERROR in panel

## [1.0.100] — 2026-08-05

- Create/import: auto-suggest free game port per node and type; live port-in-use validation in UI
- API: `GET /api/nodes/:id/suggested-port` and `port-check`; billing auto-create uses type-aware port pick

## [1.0.99] — 2026-08-05

- Bedrock ports: UDP-aware host checks, firewall, Docker publish, and clone/import/settings paths
- Startup migration fixes existing Bedrock servers with TCP primary allocations
- Install scripts open UDP ranges for Bedrock (`19132:19332/udp`) and game ports

## [1.0.98] — 2026-08-05

- Bedrock start: longer daemon power timeout (image pull + boot)
- RUNNING detection for BDS ("Server started") and boot fallback timer
- Default port 19132 for Bedrock types; BDS allowlist.json + allow-list properties
- Whitelist UI maps to BDS allowlist; join/leave log parsing for Bedrock players

## [1.0.97] — 2026-08-05

- Fix Bedrock server provision: quiet unzip so BDS extract does not exceed exec maxBuffer

## [1.0.96] — 2026-08-05

- Fix ENOENT on server create: stage default-server-icon.png in release tree and resolve icon path in bundled API/daemon

## [1.0.95] — 2026-08-05

- Native Bedrock server types: Mojang BDS (stable + preview), PocketMine-MP, Nukkit
- UDP-primary allocations and Docker runtimes for Bedrock (ubuntu BDS, pmmp PHP, Java Nukkit)
- Create-server UI grouped Java vs Bedrock Edition; wiki and README updated

## [1.0.80] — 2026-08-04

- Fix production CSS: FA subset no longer runs PurgeCSS on the full bundle (Bootstrap grid/navbar was stripped)
- Fix Font Awesome `@font-face` retained; icons render in panel and wiki screenshots
- Wiki screenshot capture waits for webfonts; auth pages use viewport-only shots

## [1.0.79] — 2026-08-04

- Wiki screenshot capture supports admin 2FA (`GUARTRIX_TOTP_FROM_DB` unseals DB secret; HTTPS for SESSION_SECURE)
- Refreshed docs/wiki/assets screenshots; Sprint 9 dev polish 6/6

## [1.0.78] — 2026-08-04

- File manager i18n: errors, dialogs, bulk select, unzip label (EN/NL)
- Web tests: `file-permissions.test.ts` for file action permission gates

## [1.0.77] — 2026-08-04

- API `src/` phase 2: `servers/`, `nodes/`, `bots/` folders (~57 modules); ~22 core files remain at root
- esbuild bot-worker entry: `apps/api/src/bots/bot-worker-main.ts`

## [1.0.76] — 2026-08-04

- API `src/` phase 1: `auth/`, `billing/`, `license/` module folders (19 files moved)
- StatusLinePage split: `useAdminStatus` hook + `components/status-line/*` (page ~78 LOC)
- Removed deprecated shared types: `McServer.javaPath`, `UpdateServerRequest.javaPath`, `ServerDatabasesResponse.ownerUsed/ownerRemaining`, `AdminStatusResponse.api` duplicate, `MAX_DATABASES_PER_*` aliases

## [1.0.75] — 2026-08-04

- Split `scripts/prod-web.mjs` into `scripts/prod-web/` modules (config, proxy, TLS, static, router, security headers)
- Staged customer releases now include the `scripts/prod-web/` directory

## [1.0.74] — 2026-08-04

- Shared `ScheduleFields` for backup + task schedule timing UI; schedules timing i18n EN/NL
- i18n `Messages` type supports nested keys (DeepStringMap)

## [1.0.73] — 2026-08-04

- Web Sentry: optional `VITE_SENTRY_DSN` (`@sentry/react`, ErrorBoundary capture)
- Online players WebSocket `/ws/servers/:id/players` (`player.read`); provider uses WS + HTTP fallback
- Biome `noExplicitAny` promoted to error
- FA solid CSS subset on production build (`npm run fa:subset`, vite PurgeCSS plugin)
- OpenAPI 100% route stubs + `generate-openapi-stubs.mjs` (from 1.0.72 docs pass)

## [1.0.72] — 2026-08-04

- DB flag `stoppedByUser`: Stop/Kill mark it, Start/Restart clear it; startOnBoot skips marked servers

## [1.0.71] — 2026-08-04

- startOnBoot no longer restarts servers the user already stopped (only resumes if status was running/starting)

## [1.0.70] — 2026-08-04

- Fix duplicate "Server marked as OFF" on intentional stop (race with attach exit handler)

## [1.0.69] — 2026-08-04

- Fix admin status logs: read from DATA_DIR/logs instead of /tmp

## [1.0.68] — 2026-08-04

- Redis multi-API HA: shared client, installer Docker/external Redis, Admin Status/Settings, Redis rate limits, transfer keys, scheduler lock, console event pub/sub

## [1.0.67] — 2026-08-04

- Improvement cut: peel daemon routes, bot-movement, addons install/sync, FileManager toolbar, AddonPanel sections, DashboardServerRow, process/sftp helpers, license validate/quota; Mollie sync tests; shared world-seed URLs; schedule migrate boot-only; SFTP legacy deprecation warn; biome noExplicitAny warn.

## [1.0.66] — 2026-08-04

- Admin License + license console: list every feature chip in green when all are enabled (no “All enabled” summary).

## [1.0.65] — 2026-08-04

- License validate reports panel usage (nodes / Minecraft servers / RAM); operator license console shows per-key **In use** vs quota.

## [1.0.64] — 2026-08-04

- Release builds: obfuscate api/daemon `dist` after minify (`javascript-obfuscator`; skip with `RELEASE_OBFUSCATE=0`; bot-worker not obfuscated)

## [1.0.63] — 2026-08-04

- License hardening: panel pushes signed/free tickets to daemons; daemon gates start/restart; default unreachable grace 12h; alert after repeated validate failures

## [1.0.62] — 2026-08-04

- Admin → Settings (General / Mail / Security / Alerts): domain, SMTP, HTTPS, quotas, Cloudflare, 2FA policy, alerts via `data/panel-settings.json`
- Cursor rule: Plan mode may be opened autonomously for large/architectural work

## [1.0.61] — 2026-08-04

- CSP: per-request script nonce on `index.html` so Cloudflare Bot JS detections can run without `'unsafe-inline'`

## [1.0.60] — 2026-08-04

- Fix addon detail Changelog / Versions tabs stuck on “Loading…” (effect cancelled itself via `versionsLoading` dep)

## [1.0.59] — 2026-08-04

- CSP: move theme boot to `/theme-boot.js` (no inline script); allow Cloudflare Web Analytics (`static.cloudflareinsights.com`); optional `CSP_SCRIPT_SRC_EXTRA` / `CSP_ALLOW_UNSAFE_INLINE_SCRIPT`

## [1.0.58] — 2026-08-04

- Detail modal: Supported environments (Client-side / Server-side / Client and server)

## [1.0.57] — 2026-08-04

- Fix addon/modpack detail tabs resetting on parent re-render (callback deps)
- Gallery: thumbnail grid so all images are visible (was carousel-only)

## [1.0.56] — 2026-08-04

- Addon/modpack detail modal: Modrinth-style tabs (Description / Gallery / Changelog / Versions); install from Versions tab

## [1.0.55] — 2026-08-04

- Modpacks: Modrinth category chips (adventure, magic, tech, …) + filter, matching Plugin Management

## [1.0.54] — 2026-08-04

- Modpacks: same install UX as plugins — detail modal + version picker (MC version + build); install uses chosen `versionId`

## [1.0.53] — 2026-08-04

- Fix Modrinth browse returning 0 hits: empty search no longer sends `query=" "` (API treats space as no matches)
- Plugins/mods: default sort **Relevance** (Modrinth-style); catalog loads on open
- Modpacks tab: same list UI as plugins (icons, author, downloads, sort, load more); Relevance default + version facet fallback

## [1.0.52] — 2026-08-04

- API: finish `servers.ts` peel — `servers-settings` / `servers-crud` / `servers-transfer` (orchestrator ~38 LOC)
- API: extract Modrinth HTTP helpers to `addons-modrinth.ts` (`addons.ts` 1394→1188)
- Web: modularize `styles.css` into `styles/{theme,layout,components,dashboard,mobile,pages}.css`
- OpenAPI: create/patch/delete + transfer/clone/reinstall/versions stubs; `npm run check:openapi` drift script

## [1.0.51] — 2026-08-03

- API: extract `servers-addons`, `servers-power`, `servers-world` (`servers.ts` 2195→1440)
- API: move `listVisibleServers` / `listVisibleServerIds` into `server-access.ts`
- Web: extract `FileBrowserTable` from FileManager
- OpenAPI: auth login/register/logout + dashboard bulk + addons/seed/disk/connect stubs

## [1.0.50] — 2026-08-03

- API: peel auth HTTP into `routes/auth.ts` (helpers stay in `auth.ts`)
- API: parallel boot status reconcile (concurrency 8)
- API: refuse `TRUSTED_PROXIES=*` unless `ALLOW_INSECURE_TRUST_PROXY=1`
- Web: Font Awesome solid-only webfonts (~−136KB brands/regular)
- Web: FileManager path helpers + editor pane extract; i18n unsaved/close/discard
- Tests: CSRF origin checks, daemon JWT round-trip, server-access permissions JSON, file path helpers

## [1.0.49] — 2026-08-03

- Perf: batch server permissions on dashboard list (kill N+1 SubUser lookups)
- Perf: `/online` and `/stats` dashboard bulk use in-memory caches only (no daemon fan-out)
- Perf: `checkAllServerUpdates` scoped to visible ids; 3m addon-update cache
- Web: lazy-load ServerDetail tab panels (smaller initial chunk)
- API: extract `routes/servers-dashboard.ts` for list/bulk poll endpoints

## [1.0.48] — 2026-08-03

- i18n: remaining settings/backup/network/SFTP/admin notices and client fallbacks (EN/NL)
- OpenAPI `info.version` → **1.0.48**; stubs for metrics, auth/me, auth/config, license/status, servers/stats
- Docs: recommend `DOCKER_NETWORK_MODE=per_server` for multi-tenant; keep `shared` default
- Docs: curl|sh install supply-chain residual risk + wiki pointer in `install-daemon.sh`

## [1.0.47] — 2026-08-03

- i18n: Plugin Management help/sync/sort UI + modpack/backup/network alert chrome

## [1.0.46] — 2026-08-03

- i18n: expand EN/NL across auth, dashboard, server tabs/panels, modals, admin chrome

## [1.0.45] — 2026-08-03

- PWA **Web Push** opt-in for critical alerts (crash / crash-loop / disk-high / offline)
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`; Account → Security toggle
- Service worker push + notification click; GDPR export includes push endpoints
- Docs: drop WHMCS deeper-sync framing (Application API + billing webhooks remain)

## [1.0.44] — 2026-08-03

- Modularize `@msm/shared`: thin barrel + `types/{server,auth,nodes,databases,schedules,files-stats}`
- i18n EN/NL foundation (`apps/web/src/i18n`); language picker on Account → Security
- Persist console stats history across API restarts (`data/stats-history/`)
- Web: light / system theme preference (`guartrix.theme`, Account → Security)
- Daemon: optional `DOCKER_NETWORK_MODE=per_server` (per-server bridges + shared MySQL attach)
- OpenAPI `info.version` → **1.0.44**

## [1.0.43] — 2026-08-03

- Schedules: Prisma `ScheduledTask` (JSON schedule/steps); one-shot import from `guartrix-scheduled-tasks.json`
- HA sessions: `SESSION_STORE=file|redis` + `REDIS_URL`; optional `ioredis` RedisSessionStore; scaling docs (NFS)
- Rootless Docker steps in install-nodes wiki
- CSP: optional `CSP_REPORT_ONLY=1` Report-Only header (stricter style-src) in prod-web
- Optional server **extra Docker mounts** (`extraMounts` JSON on Server; allowlisted host prefixes)
- Web: split hand-rolled `api.ts` into `apps/web/src/api/*` domain modules
- Dashboard: single 15s visible-tab poll (list/stats/online + staggered update checks)
- OpenAPI `info.version` synced to product **1.0.43**

## [1.0.42] — 2026-08-03

- Fix: panel **Stop** / **Kill** no longer trigger auto-restart (intentional stop flag + treat Docker SIGTERM exit 143 as clean)

## [1.0.41] — 2026-08-03

- Node **location** labels (schema + admin UI + create picker)
- File-backed rate-limit store (`RATE_LIMIT_STORE=file`, default)
- GDPR: `GET /api/account/export` + `DELETE /api/account` (Account Security UI)
- Versioned scrypt password hashes (`scrypt$v1$…`) with legacy verify + rehash on login
- Prometheus `/metrics` (API + daemon; `METRICS_TOKEN` or localhost)
- Optional Sentry (`SENTRY_DSN`); Prisma slow-query log (`PRISMA_SLOW_MS`)
- Docker json-file log rotation (`DOCKER_LOG_MAX_SIZE` / `DOCKER_LOG_MAX_FILE`)
- Dev MySQL Compose (`docker-compose.dev.yml`); stack items can pin `versionId`

## [1.0.40] — 2026-08-03

- Optional **backup encryption** at rest (`BACKUP_ENCRYPTION=1`, AES-256-GCM → `.tar.gz.enc`)
- Encrypted badge in Backup panel; restore decrypts with panel key; downloads stay ciphertext

## [1.0.39] — 2026-08-03

- Split `ServerDetailPage` / `ServerSettings` into `server-detail/` + `server-settings/` modules
- Offload Mineflayer bots to a forked API worker (`bot-worker-main` IPC; `BOT_WORKER=0` fallback)

## [1.0.37] — 2026-08-03

- P1 pass: readiness (`/api/ready` checks local daemon), crash-loop alerts (`server.crash_loop`)
- Transfer job progress persisted under `data/transfers/`; hydrate after API restart
- Create-server node ranking uses `memoryUsableMb` (matches host reserve) + recommended hint
- File Manager / Backups / Schedules use ConfirmModal + PromptModal (no `prompt`/`confirm`)
- Player routes extracted to `servers-players.ts`; `http-error` envelope helpers; OpenAPI health/nodes
- Offsite backup hook `BACKUP_OFFSITE_CMD`; Biome lint; Dependabot Actions + CI `npm audit`
- Playwright smoke expanded (login → server); Docker least-privilege notes in install-nodes

## [1.0.36] — 2026-08-03

- Prisma **migrations** instead of `db push` for installs/upgrades (`20260803120000_init`, `scripts/db-migrate.sh`, legacy baseline)
- Unit tests for sealed game DB passwords (`db-password.test.ts`)
- Docs/install/download INSTALL paths use `bash scripts/db-migrate.sh`

## [1.0.35] — 2026-08-03

- Deduplicate player-history into `@msm/node-agent` (API imports the shared module)
- React `ErrorBoundary` around panel routes with retry / dashboard fallback
- Structured pino logging foundation for the API (`LOG_LEVEL`, request ids)
- Prisma client: warn/error query log + `DATABASE_URL` pooling notes
- Explicit scrypt cost params for password hashing (compatible with existing hashes)
- CSP: document `style-src 'unsafe-inline'` and add `style-src-attr`
- Docs: OpenAPI version bump, English roadmap summary, this changelog

## [1.0.34] — 2026-08-03

- Compact server header **Manage** menu on small screens

## [1.0.33] — 2026-08-03

- Collapse crowded top nav into **Admin** and **Account** menus

## [1.0.32] — 2026-08-03

- Security hardening: SSRF guards, file jail, PATCH authorization, Docker capability tightening
