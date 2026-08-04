# Changelog

All notable changes to Guartrix are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

-

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
