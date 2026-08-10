# Guartrix improvement map

Living overview of **what is shipped**, **what is in progress**, and **what remains optional**.
Formerly called “roadmap”; same file, clearer name.

**Scale (100n/1000c):** [docs/scale-100n-1000c-roadmap.md](scale-100n-1000c-roadmap.md) · **Live:** [guartrix.com](https://guartrix.com) · **Wiki:** [docs/wiki/README.md](wiki/README.md) · **History:** [CHANGELOG.md](../CHANGELOG.md)

Last updated: **2026-08-10** · product **v1.4.47**

---

## At a glance

| Area | Status |
|------|--------|
| Feature sprints 1–8 (disk/CPU → Mollie) | ✅ Complete |
| Sprint 9 — polish (product) | ✅ Complete on this host |
| Scale 100n/1000c control-plane | ✅ **1.1.0** ([roadmap](scale-100n-1000c-roadmap.md) · [upgrade](wiki/upgrade-to-1.1.md)) |
| Sprint 10 — SaaS / SLA track | ✅ **1.1.2** (Go-live UI, BullMQ, `/api/v1`, peer MySQL, CI) |
| Sprint 11 — SaaS harden | ✅ **1.2.0** (HA flag, peer-only transfer, owner limits, ops drills, CI) |
| Customer go-live (webhook/SMTP/Mollie) | Their install — Admin → Settings → Go-live |
| Enterprise code wave 2+ (structure, CI, services, tests) | ✅ **1.4.31** ([wave 2 wiki](wiki/enterprise-code-wave2.md)) |
| Enterprise code wave 3 (SLA, pentest, optional test depth) | 🔄 Operator backlog ([wave 3 wiki](wiki/enterprise-code-wave3.md)) |

---

## English summary

### Shipped (high level)

- Multi-node daemon, SFTP, MySQL, backups, subusers, Modrinth
- Disk quota + CPU limits, allocations, activity log, 2FA, Client/Application API
- Node transfer, schedule chains + file archives, Mollie billing
- License enforcement (free tier + paid caps), hosting tools, PWA shell + Web Push
- Redis multi-API HA (sessions, rate limits, transfers, scheduler lock, event bus, BullMQ)
- i18n EN/NL, schedules in Prisma (`ScheduledTask`), node location labels
- Admin → Settings UI, license hardening (daemon tickets), modpack/plugin Modrinth UX
- `startOnBoot` respects user stop (`stoppedByUser` DB flag)
- SaaS harden: `REQUIRE_REDIS_HA`, peer-only transfers, owner API rate limits, SLA drill scripts

### Still open

Optional **P2** (eggs/nests, Redis Cluster/Sentinel). Webhook, SMTP, and Mollie are **customer setup** after install.

**Enterprise wave 2+** is **complete** (E1–E6, v1.4.31). **Wave 3** is operator SLA/pentest + optional service tests — see [enterprise-code-wave3.md](wiki/enterprise-code-wave3.md). Load/stress testing remains operator-only (blocked in cloud).

**Operator process (not agent backlog):** external pentest execution and counsel-signed SLAs use wiki templates + Go-live attestations ([sla-ops.md](wiki/sla-ops.md) · [pentest-scope.md](wiki/pentest-scope.md)).

---

## Sprint 11 — SaaS harden *(1.2.0)* · ops pack **1.2.1**

| Item | Status |
|------|--------|
| `REQUIRE_REDIS_HA` / `PANEL_HA` boot + Go-live hard fails | [x] |
| BullMQ owns disk-watch ticks; no silent HA fallback | [x] |
| `TRANSFER_ALLOW_PANEL_STAGING` default off (peer-only) | [x] |
| Stable error codes + `RATE_LIMITED`; `/api/v1` rewrite helper | [x] |
| `API_OWNER_RATE_LIMIT` aggregate abuse control | [x] |
| CI: expanded Biome paths, MySQL+Redis integration job, Playwright secrets map | [x] |
| SLA restore/secret-rotation drill scripts + pentest-scope wiki | [x] |
| Go-live secret-rotation attestation | [x] |

---

## Sprint 10 — SaaS / SLA *(1.1.2)*

| Item | Status |
|------|--------|
| Invite accept requires `emailVerified` | [x] |
| Admin → Settings → Go-live readiness + SLA attestations | [x] |
| BullMQ job queues when Redis configured (fail-closed scheduler lock) | [x] |
| `/api/v1` dual-mount + error envelope docs | [x] (1.1.3: Fastify `rewriteUrl`) |
| Peer MySQL on node transfer (`restore-from`) | [x] |
| CI Biome lint + Playwright staging workflow | [x] |
| SLA ops wiki + pentest scope brief | [x] |

---

## Sprint 9 — polish *(complete on download host)*

Product polish for shipping — no new features. **This repo host** builds and publishes customer zips (`download.guartrix.com`); it is not a live hosting panel that needs Discord webhooks, SMTP, or Mollie.

### Done here (build / download operator)

| Item | Status |
|------|--------|
| Panel DB backup timer | [x] daily ~03:15 UTC |
| OpenAPI 165/165 + `--strict` | [x] |
| OpenAPI version sync + stub generator | [x] |

### Customer install (their VPS — documented, not this host)

After `install-panel.sh`, customers configure alerts and billing themselves:

| Item | Where |
|------|--------|
| Activity webhook | **Admin → Settings → Alerts** or `ACTIVITY_WEBHOOK_URL` |
| Alert email + SMTP | **Admin → Settings → Mail** |
| Mollie checkout | `MOLLIE_API_KEY` in `.env` (if they use billing) |
| Panel DB backup timer | `sudo bash scripts/install-panel-backup-cron.sh` on **their** server |

See [panel-settings.md](wiki/panel-settings.md) · [install-panel.md](wiki/install-panel.md).

### Dev polish (optional)

| Item | Target | Status |
|------|--------|--------|
| OpenAPI full coverage | `npm run check:openapi --strict` | [x] 165/165 (100%) |
| OpenAPI `info.version` sync | Match root `package.json` / `VERSION` on each release | [x] 1.1.1 |
| Regenerate stubs after new routes | `node scripts/generate-openapi-stubs.mjs` | [x] script added |
| Web Sentry | `VITE_SENTRY_DSN` at build time | [x] wired in apps/web |
| Biome `noExplicitAny` | warn → error | [x] |
| FA solid CSS subset | `npm run fa:subset` + vite build plugin | [x] |
| OnlinePlayers WS | `/ws/servers/:id/players` + provider | [x] |
| Screenshots after UI changes | `scripts/capture-wiki-screenshots.mjs` | [x] `GUARTRIX_TOTP_FROM_DB=1` + HTTPS |

---

## Feature sprints 1–8 ✅

All planned feature sprints are **done**. Detail per area:

| # | Sprint | Doc |
|---|--------|-----|
| 1 | Disk-quota + CPU-limit | — |
| 2 | Allocations (ports, Network tab) | — |
| 3 | Activity log | [activity-log.md](wiki/activity-log.md) |
| 4 | 2FA (TOTP) + SFTP app-passwords | [accounts-and-quotas.md](wiki/accounts-and-quotas.md) |
| 5 | Client API / API keys | [client-api.md](wiki/client-api.md) |
| 6 | Node transfer | [node-transfer.md](wiki/node-transfer.md) |
| 7 | Schedule chains + file archives | [schedules.md](wiki/schedules.md) |
| 8 | Application API + Mollie | [application-api.md](wiki/application-api.md) |

Polish items for sprints 2–8 (screenshots, Prisma schedules, OpenAPI sketch, MySQL on transfer, …) are all checked off.

---

## P2 — later / optional

| Item | Notitie |
|------|---------|
| **Eggs / nests** | Deferred — multi-game only; not planned for Minecraft-first download |
| ~~Extra mounts~~ | Shipped — `extraMounts` + `EXTRA_MOUNTS_ALLOW_PREFIX` |
| ~~Locations~~ | Shipped — optioneel `location`-label op nodes |
| ~~Redis / HA panel~~ | Shipped — `REDIS_ENABLED`; zie [scaling.md](wiki/scaling.md) |
| ~~i18n~~ | Shipped — EN/NL |
| ~~Schedules in Prisma~~ | Shipped — `ScheduledTask` |
| OpenAPI coverage | **Done** — 165/165; stub generator `scripts/generate-openapi-stubs.mjs` |
| Web Sentry | `VITE_SENTRY_DSN` |

---

## Recent shipments (v1.0.44 – v1.0.164)

Full release notes: [CHANGELOG.md](../CHANGELOG.md). Highlights:

- **1.0.164** — Scorecard ≥99: coverage 95%, OpenAPI/CI audit, wiki peels, supervision guard
- **1.0.163** — Docs audit + always-commit-push rule; OpenAPI/wiki sync
- **1.0.162** — Scorecard peels, coverage floor, NL lazy-load, install preseed
- **1.0.158–161** — Security tests, daemon-client peels, runtime compress/caches
- **1.0.72** — `stoppedByUser`; startOnBoot skips user-stopped servers
- **1.0.68** — Redis multi-API HA
- **1.0.62** — Admin → Settings (General / Mail / Security / Alerts)
- **1.0.63–65** — License hardening + usage/quota reporting
- **1.0.45** — PWA Web Push
- **1.0.44–48** — i18n EN/NL

Earlier backlog (Jul–Aug): extra mounts, join card, hosting tools, modpacks, license enforcement, stats persist, per-server Docker networks — see CHANGELOG ≤ 1.0.43.

---

## Security / productie

Hardening checklist: [security.md](wiki/security.md). Code-side controls are shipped; webhook/SMTP/Mollie are optional **per customer install**.

---

## Docs hygiene (doorlopend)

- [x] Wiki + README bij elke feature ([keep-docs-updated](../.cursor/rules/keep-docs-updated.mdc))
- [x] Improvement map bijgewerkt t/m v1.0.164 (2026-08-06)
- [x] Always commit+push bij afronden ([always-commit-push](../.cursor/rules/always-commit-push.mdc))

---

## Niet doen (bewust)

- Een bestaand PHP/Laravel hosting-panel 1:1 kopiëren
- Generieke egg-marketplace (tenzij multi-game expliciet gewenst)
- Volledige location/allocation-complexiteit van andere panels in één klap

---

## Nederlands — detail (sprints 1–8, historisch)

Laatst bijgewerkt: 2026-08-06 · **v1.0.164**

Alle sprints hieronder zijn **af**. Geen Sprint 10 gedefinieerd; zie Sprint 9 hierboven. Historical sprint checklists remain for archive only — current product version is **v1.4.24** (see `VERSION` / changelog).

<details>
<summary>Sprint polish-checklists (ingeklapt — alles afgevinkt)</summary>

### Application API / Mollie

- [x] Mollie recurring / subscriptions
- [x] Auto-create server after paid
- [x] Screenshot Billing-pagina’s in panel-guide

### Schedule chains + file archives

- [x] Screenshot Schedules + File Manager zip/download
- [x] Weekday schedules (`mode: "weekly"`)
- [x] Zip-on-the-fly download
- [x] Schedules in Prisma

### Node transfer

- [x] MySQL dump/restore mee verhuizen
- [x] Screenshot Move-modal
- [x] Chunked progress %

### API keys

- [x] Custom permission picker
- [x] Screenshot API-keys sectie
- [x] OpenAPI full coverage (165/165; `--strict` passes)

### 2FA

- [x] Inline QR-code bij setup
- [x] Screenshot Security + 2FA login
- [x] SFTP app-passwords (`gtap_…`)

### Activity log

- [x] Screenshot Activity Log + `/admin/activity`
- [x] Activity per gebruiker (Users-pagina)
- [x] CSV/JSON-export
- [x] `backup.download` / `file.download` gelogd

### Allocations

- [x] Admin UI port-pool op System
- [x] Screenshot Network-tab
- [x] UI-waarschuwing: extra poorten na restart
- [x] UDP+TCP companion (`alsoUdp`)

### Security (code)

- [x] Symlink-jail, archives, rate limits, CSRF, session secure
- [x] Login rate-limit + `TRUSTED_PROXIES`
- [x] Daemon JWT / roterende tokens
- [x] Secret-rotatie runbook
- [x] Panel-uitval alerts (watchdog → webhook)
- [x] License hardening + CSP hardening

</details>
