# Changelog

All notable changes to Guartrix are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.4.61] — 2026-08-12

- Application API `POST /api/application/servers`: optional `storageId` (auto/local pool/NFS) + `GET /api/application/storages` and `…/nodes/:id/storages`.

## [1.4.60] — 2026-08-12

- Admin → Users: show **Owner ID** per account with copy button (for Application API `ownerId`).

## [1.4.59] — 2026-08-12

- API explorer **Try it** with `gt_`/`gta_` keys: omit session cookie so CSRF no longer blocks mutating requests while logged in.

## [1.4.58] — 2026-08-12

- **Auto placement** on create/clone/import: omit `nodeId` / `storageId` → most free RAM → CPU → storage (panel `POST /api/servers`; Application API auto-picks node only).
- API docs: explorer **Body fields** table on create server; wiki/README placement notes.

## [1.4.57] — 2026-08-12

- Create: pick **Fabric/Quilt loader** and **Forge/NeoForge** version (same channel picker as Paper/Purpur builds).
- Apply update / version modal: choose build or loader before installing (not always latest).
- Admin Storage: live capacity pie (total / used / free) per pool and linked node.

## [1.4.55] — 2026-08-12

- Admin **Storage** page: global pools (local/NFS) with multi-node links; per-node mount/unmount. Removed Storage tab from node edit.
- Prisma: `StoragePool` + `StorageNodeLink` replace `NodeStorage`; API under `/api/admin/storages`.

## [1.4.54] — 2026-08-12

- Create server: choose **Paper/Purpur build** (defaults to newest); `GET /api/versions/builds` + optional `paperBuild` on create.

## [1.4.53] — 2026-08-12

- Create UX: clear stuck **Creating:** console/banner when the server leaves `CREATING` (e.g. already `STARTING`).
- Local storage pools write jars in place (no slow tar “deploy to node”); remote still shows download → deploy progress.

## [1.4.52] — 2026-08-11

- Fix create on **storage pools**: deploy jars via daemon so `server.jar` lands on the NFS/local mount (was written only under panel `DATA_DIR` → start failed with jar not found).
- Addon/update paths resolve the pool mount on local nodes; wipe clears stale `server-locations` entries.

## [1.4.51] — 2026-08-11

- Daemon storage mount: create mount-point dirs with `sudo mkdir -p` fallback on `EACCES`/`EPERM` (fixes Mount when `/var/lib/guartrix` is missing or root-owned).
- Docs: install-nodes — create/chown `/var/lib/guartrix/mounts` before first Mount; sudoers example includes `mkdir`.

## [1.4.50] — 2026-08-11

- Docs/README: node **storage pools** screenshots (`40`/`41`) + wiki/panel guide updates.

## [1.4.49] — 2026-08-11

- Admin Nodes: **Storage** tab — add local or NFS pools, mount/unmount from the panel, place servers on a pool (`NodeStorage` / `Server.storageId`).

## [1.4.48] — 2026-08-10

### Added
- Admin Mail templates: logo **height**, **max width**, and **alignment** settings (applied in mail layout via `{{logoHeight}}` / `{{logoMaxWidth}}` / `{{logoAlign}}`).

## [1.4.47] — 2026-08-10

### Added
- Admin Mail templates: edit shared **Header** / **Footer** (plus full layout HTML/text) with preview for all emails.

## [1.4.46] — 2026-08-10

### Fixed
- CSP: allow Monaco `worker-src 'self' blob:` so the mail/file editor can create web workers.

## [1.4.45] — 2026-08-10

### Fixed
- Monaco editor assets: keep `toggleHighContrast` + HTML language packs so `/monaco/vs/*` is not SPA-fallback HTML (MIME error in Admin mail templates / file editor).

## [1.4.44] — 2026-08-10

### Added
- Admin Mail template editor: **Monaco** code editor for HTML/text; **logo upload** / URL / remove (`data/branding/`, `/api/public/branding/logo`).

### Fixed
- Mail `{{logoUrl}}` absolutizes relative `appLogo` paths against `publicBaseUrl` for Outlook and other clients.

## [1.4.43] — 2026-08-10

### Added
- Admin Mail template Preview: **Light / Dark** toggle (Outlook-style dark-mode approximation).

## [1.4.42] — 2026-08-10

### Fixed
- Admin Mail template editor inputs follow dark/light theme tokens (no forced white fields).

## [1.4.41] — 2026-08-10

### Changed
- Admin Mail template editor: flat full-width paste panes (HTML / text / preview tabs) with straight borders.
- Default mail templates: flatter layout with square edges and clearer divider lines.

## [1.4.40] — 2026-08-10

### Fixed
- Admin Mail template **Preview** no longer clears itself immediately (view reload wiped the preview).

## [1.4.39] — 2026-08-10

### Added
- Admin → Settings → Mail **template editor** (override subject/HTML/text + layout; stored in `data/mail-templates.json`).

## [1.4.38] — 2026-08-10

### Added
- Branded HTML + plain-text mail templates (`apps/api/src/mail-templates/`) for verify, password reset, invites, alerts, and Admin test mail; SMTP sends multipart/alternative.

## [1.4.37] — 2026-08-10

### Changed
- Outbound SMTP From header uses display name `Guartrix <address>` for better client reputation.

## [1.4.36] — 2026-08-10

### Fixed
- SMTP messages include Date + Message-ID (Outlook delivery); mailserver Amavis disabled so outbound is not bounced as BAD-HEADER.

## [1.4.35] — 2026-08-10

### Fixed
- SMTP **STARTTLS** (port 587) actually works in the panel mail client (was falling back to outbox).

### Changed
- Admin → Mail: primary **Test mail server** button; failed tests return the SMTP error instead of a soft outbox notice.

## [1.4.34] — 2026-08-10

### Added
- `sla-go-live-drill.sh --live --attest-all` — one-shot live SLA drills + Go-live dates.
- `sla-capacity-review-drill.sh`; panel-settings attest supports boolean ack fields.

## [1.4.33] — 2026-08-10

### Added
- SLA secret rotation drill: `--live` smoke checks, `--backup-first`, `--attest` → Go-live `slaSecretRotationAt`.
- Shared `scripts/lib/panel-settings-attest.mjs`; restore drill `--backup-only --attest`.

## [1.4.32] — 2026-08-10

### Added
- W3-E5+ service tests: servers-create, billing-checkout, servers-transfer.
- k6 load-test template for operator staging (`scripts/load-test-k6-template.js`).
- Wave 3 operator checklists (SLA drills, pentest prep).

## [1.4.31] — 2026-08-10

### Added
- W3-E5: CI runs `npm run test:coverage` with Vitest floors.
- W3-E6: Playwright e2e job in CI (MySQL + panel boot), `e2e/smoke.spec.ts`, staging workflow, `scripts/e2e-ci.sh`.

## [1.4.30] — 2026-08-10

### Added
- E2c+ services: server-settings-apply, servers-transfer, nodes-admin; server-settings Zod schema.

### Changed
- Settings apply, transfer, and nodes admin routes thinned to HTTP/auth shells.

## [1.4.29] — 2026-08-10

### Fixed
- Release bundle crash (`ReferenceError: vI is not defined`) — import Zod role schemas from shared source; safer esbuild minify for re-exports.

## [1.4.28] — 2026-08-10

### Added
- E2c services: servers-create, servers-lifecycle (delete/clone), servers-import; wave 3 roadmap (tests, e2e, SLA, pentest).
- CI: separate `npm test` job after check:enterprise.

### Changed
- Server create/clone/delete/import routes thinned to HTTP shells calling services.

## [1.4.27] — 2026-08-10

### Added
- OpenAPI sync for 14 shared contract schemas (account, auth, nodes, billing, allocations, backups).
- UI splits: NodesTable, SecurityPanel sections, TwoFactor hooks/panels, ServerDetailHeader actions/stats.

### Changed
- E3b + E4 complete: zero `size-budget: ignore` files; billing user routes split + checkout service.

## [1.4.26] — 2026-08-10

### Changed
- E2 complete: all API routes import `services/` instead of `repositories/`; domain passthrough modules (servers, nodes, users, allocations, billing, account, auth-tokens, application-api, activity-events).
- `routes-no-repositories` dependency-cruiser rule promoted to **error** (0 violations).

## [1.4.25] — 2026-08-10

### Added
- Enterprise code wave 2: `npm run check:enterprise`, GitHub Actions CI (structure gates, no vitest), wave-2 roadmap wiki + canvas.

### Changed
- Zod catalog in `@guartrix/shared/schemas/` (auth, account, nodes, billing, allocations, backups); API `schemas/` re-exports.
- Services layer started: admin-nav, admin-activity, billing-plans, auth-users; routes-no-repositories dep-cruiser warn.

## [1.4.24] — 2026-08-10

### Changed
- Server Zod contracts moved to `@guartrix/shared/schemas/servers`; routes↛prisma enforced (repositories layer); wiki article TS mirrors stripped (markdown-only metadata).

## [1.4.23] — 2026-08-10

### Changed
- Enterprise-split P2: wiki markdown embed from docs/wiki (W5); daemon event DTOs in shared (C4); file naming glossary (N2); file-size budgets (Q2); service-layer tests (Q3).

## [1.4.22] — 2026-08-10

### Changed
- Enterprise-split P1: NodesPage rename (W3); thin AdminServers/Dashboard/AccountBilling (W4); shared safe-url (C3); auth crypto import gate + dependency-cruiser (A4/Q1); OpenAPI schemas synced from `schemas/servers.ts` (C2); API `infra/` + `lib/` tidy (A3); workspaces `@msm/*` → `@guartrix/*` (N1).

## [1.4.21] — 2026-08-10

### Changed
- Enterprise-split P0: finish web feature-folder duals (W1), API `services/` for profile/subusers/databases/gdpr (A1/A2), shared Client+Application Zod in `schemas/servers.ts` (C1).

## [1.4.20] — 2026-08-10

### Changed
- Enterprise-split P0 W2: split ProfileSection, UsersPage, AccountSecurityPage, AdminSettingsPage into thin composition shells.

## [1.4.19] — 2026-08-08

### Fixed
- Node transfer peer deploy rejected normal directory members like `./config/` as unsafe (trailing `/` in tar listings).

## [1.4.18] — 2026-08-08

### Changed
- Redis `maxRetriesPerRequest` default raised to **50** (override with `REDIS_MAX_RETRIES_PER_REQUEST`).

## [1.4.17] — 2026-08-08

### Fixed
- Redis client is only published after a successful PING; with `SESSION_STORE=redis` but no Redis process (typical local multi-node labs), sessions fall back to file instead of login `maxRetriesPerRequest` 500s.

## [1.4.16] — 2026-08-08

### Fixed
- Redis session blips during panel restart no longer brick login with opaque `maxRetriesPerRequest` 500s (more retries + clearer 503).

## [1.4.15] — 2026-08-08

### Fixed
- Add-node SSH live log always auto-scrolls to the latest remote output.

## [1.4.14] — 2026-08-08

### Changed
- Add-node SSH install: first host-key fingerprint is a confirm step (**Trust fingerprint & install**), not a hard red error; clearer NL/EN copy for trust/replace.

## [1.4.13] — 2026-08-08

### Fixed
- Always use portable `tar` extract flags only (`-z`/`-x`/`-f`/`-C`, etc.) — never GNU long options such as `--no-absolute-filenames` — so BusyBox/minimal `tar` works on all nodes; archive member paths remain pre-validated in Node.

## [1.4.12] — 2026-08-08

### Fixed
- Remote create stuck on BusyBox/`tar`: republish daemon bundle with portable tar extract flags (`packages/node-agent` safe-archive).
- Failed async create no longer deletes the server row so Console can show `ERROR`.
- `install-daemon-bundle.zip` selection uses semver-correct zip pick (and can force-republish).

## [1.4.11] — 2026-08-08

### Changed
- Panel create/import returns immediately (`CREATING`) and opens the server Console with live install progress instead of blocking on the create page.

## [1.4.10] — 2026-08-08

### Fixed
- Node transfer stuck on Validate 0% (`Transfer: starting…`): run moves inline in the API instead of BullMQ (in-memory job + fixed jobId silent no-op). Unlock stuck `TRANSFERRING` servers on restart / retry.

## [1.4.9] — 2026-08-08

### Fixed
- Server deploy on remote nodes with BusyBox/`tar` that rejects GNU-only `--no-absolute-filenames` (and related long options): detect GNU tar via `--version` and use portable extract flags otherwise.

## [1.4.1] — 2026-08-08

- Public repo: drop operator/dev-only scripts and tooling from git (kept locally via `.gitignore`); keep install/run scripts for users.

## [1.4.0] — 2026-08-07

- Fresh repository baseline on `main` (history reset). Current Guartrix panel release tree as of this tag.
