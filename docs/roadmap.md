# Guartrix roadmap

## English summary

What is **already shipped**, and what is **still open**. Order = recommended sprints (Ptero/Wings ideas that fit Guartrix).

**Live:** [guartrix.com](https://guartrix.com) · **Wiki:** [docs/wiki/README.md](wiki/README.md)

Last updated: 2026-08-03

### Done (high level)

- Multi-node daemon (Wings-style), SFTP, MySQL, backups, subusers, Modrinth
- Disk quota + CPU limits, allocations, activity log, 2FA, Client/Application API
- Node transfer, schedule chains + file archives, Mollie billing
- License enforcement (free tier + paid caps), hosting tools, PWA shell

### Still optional / later (P2)

- Eggs / nests (only if multi-game)
- Extra mounts, location labels, Redis / HA panel (see [scaling.md](wiki/scaling.md))

### Next ops actions

Set `ACTIVITY_WEBHOOK_URL` (and optional `ALERT_EMAIL` / `SMTP_*`) for Discord alerts, and `MOLLIE_API_KEY` if checkout should go live. Install the panel DB backup timer (`sudo bash scripts/install-panel-backup-cron.sh`).

---

## Nederlands (detail)

Wat er **al af** is, en wat we **nog moeten doen**. Volgorde = aanbevolen sprints (Ptero/Wings-ideeën die bij Guartrix passen).

**Live:** [guartrix.com](https://guartrix.com) · **Wiki:** [docs/wiki/README.md](wiki/README.md)

Laatst bijgewerkt: 2026-08-03

---

## Klaar

| # | Item | Status |
|---|------|--------|
| — | Multi-node daemon (Wings-stijl), SFTP, MySQL, backups, subusers, Modrinth | Done |
| — | Wings-achtige Docker stats-stream → WS + cached disk | Done |
| 1 | **Disk-quota + CPU-limit** (`diskMb`, `cpuLimit` / `--cpus`, enforce + UI) | Done |
| 2 | **Allocations** (primary + extra ports, Docker publish, firewall, Network-tab) | Done |
| 3 | **Activity log** (audit trail + filters, admin-overzicht, Discord/email alerts) | Done |
| 4 | **2FA (TOTP)** (setup, recovery codes, role-required, login step) | Done |
| 5 | **API keys / Client API** (Bearer keys, scopes, rate limit, docs) | Done |
| 6 | **Node transfer** (stop → sync → rebind ports/DNS → start + progress UI) | Done |
| 7 | **Schedule chains + file archives** (steps, delays; download / zip / unzip / bulk) | Done |
| 8 | **Application API + Mollie** (plans, checkout, `gta_` keys, outbound billing webhook) | Done |

---

## Open — sprints (aanbevolen volgorde)

*(Geen vaste volgende sprint — zie P2 / polish-secties hieronder.)*

---

## Application API / Mollie — afronden / polish

Sprint 8 werkt end-to-end ([application-api.md](wiki/application-api.md)); polish:

- [x] Mollie recurring / subscriptions (customer + first payment + `BillingSubscription`)
- [x] Auto-create server after paid (plan defaults + `autoCreateServer`)
- [x] Screenshot Billing-pagina’s in panel-guide (`28` / `29` via capture script)

---

## Schedule chains + file archives — afronden / polish

Sprint 7 werkt end-to-end ([schedules.md](wiki/schedules.md)); polish:

- [x] Screenshot Schedules chain-builder + File Manager zip/download
- [x] Weekday schedules (`mode: "weekly"` + `weekdays`)
- [x] Zip-on-the-fly download (`/files/download-zip`, no temp archive on the node)

---

## Node transfer — afronden / polish

Sprint 6 werkt end-to-end ([node-transfer.md](wiki/node-transfer.md)); polish:

- [x] Automatische MySQL dump/restore mee verhuizen
- [x] Screenshot Move-modal in panel-guide
- [x] Chunked progress % (step-weighted + payload size detail in Move UI)

---

## API keys — afronden / polish

Sprint 5 werkt end-to-end ([client-api.md](wiki/client-api.md)); polish:

- [x] Custom permission picker (presets + per-permission checkboxes)
- [x] Screenshot API-keys sectie in panel-guide
- [x] OpenAPI sketch ([openapi.yaml](openapi.yaml))

---

## 2FA — afronden / polish

Sprint 4 werkt end-to-end; polish:

- [x] Inline QR-code bij setup (client-side, secret blijft in de browser)
- [x] Screenshot Security-pagina + 2FA login-stap in panel-guide
- [x] SFTP app-passwords (`gtap_…`) naast panel-wachtwoord

---

## Activity log — afronden / polish

Sprint 3 werkt end-to-end ([activity-log.md](wiki/activity-log.md)); polish:

- [x] Screenshot **Activity Log**-tab + `/admin/activity` (`scripts/capture-docs-screenshots.mjs`)
- [x] Activity per **gebruiker** vanuit de Users-pagina
- [x] CSV/JSON-export van de huidige filterset
- [x] `backup.download` (en `file.download`) gelogd

---

## Allocations — afronden / polish

Sprint 2 werkt end-to-end; polish:

- [x] **Admin UI** voor node port-pool (range create/delete op System)
- [x] Screenshot **Network**-tab in panel-guide (`scripts/capture-docs-screenshots.mjs`)
- [x] Duidelijke UI-waarschuwing: extra poorten pas na **restart** in Docker
- [x] UDP+TCP companion bij primary-assign (`alsoUdp`)

---

## Disk / CPU (Sprint 1)

Sprint 1 is compleet (`diskMb`, `cpuLimit`, enforce + UI) — geen open polish.

---

## Security / productie (go-live)

Hardening-checklist blijft leidend: [security.md](wiki/security.md).

- [x] Periodieke review: symlink-jail, archive extract, rate limits, CSRF, session secure (gedocumenteerd + geverifieerd)
- [x] Login rate-limit niet spoofbaar via `X-Forwarded-For` (`TRUSTED_PROXIES`, default localhost)
- [x] Daemon JWT / roterende tokens (HS256, Wings-stijl; legacy bearer optioneel)
- [x] Secret-rotatie runbook (SESSION_SECRET, daemon tokens, DB) — in [security.md](wiki/security.md)
- [x] Alerts bij **panel**-uitval (watchdog → `ACTIVITY_WEBHOOK_URL`)

---

## P2 — later / optioneel

| Item | Notitie |
|------|---------|
| Eggs / nests | Alleen nodig als multi-game; Guartrix = Minecraft-first |
| Extra mounts | Extra host-paths in container |
| Locations | Multi-region / locatie-labels op nodes |
| Redis / HA panel | Pas nodig bij meerdere API-replica’s — zie [scaling.md](wiki/scaling.md) |

### Post-roadmap (2026-08-03)

- [x] Join card (address/QR) + player moderation history
- [x] Owner alerts (disk/OOM) + Discord status webhook
- [x] Velocity/Bungee proxy helpers + subuser invite links
- [x] BlueMap one-click + recommended plugin stacks + console favorites
- [x] PWA app-shell (no push)

### Post-roadmap (2026-08-01)

- [x] Hosting tools: reinstall, version picker, change software type
- [x] World reset / zip import + create-flow seed/presets
- [x] Paper/Purpur Engine settings tab
- [x] Modrinth/CurseForge modpacks + Geyser one-click (UDP)
- [x] Panel license enforcement (validate API + free tier 1 node / 1 server / 10 GB; licensed product caps)

### Post-roadmap (2026-07-28)

- [x] Billing cancel + failed renewal revoke (quota → `DEFAULT_MAX_*`, stop servers)
- [x] Console WebSocket auto-reconnect
- [x] Clone modal (geen `prompt()`)
- [x] Dashboard zoek / status / node / type filters
- [x] File Manager uploads gestreamd, limiet 2 GiB
- [x] Netwerk-grafieken + API ring-buffer stats history (~1u)
- [x] Node transfer zonder panel-unpack (één tar.gz stream)
- [x] Panel DB backup script + install-timer docs; `DAEMON_JWT_TTL` typo gefixt

---

## Docs / ops hygiene (doorlopend)

- [x] Wiki + README bijhouden bij elke feature ([keep-docs-updated](../.cursor/rules/keep-docs-updated.mdc))
- [x] Screenshots vernieuwen na UI-wijzigingen (capture-script uitgebreid)
- [x] Roadmap afvinken + rebuild (`npm run build && bash scripts/start.sh`)

---

## Niet doen (bewust)

- Volledig PHP/Laravel Pterodactyl-panel 1:1 kopiëren
- Generieke egg-marketplace (tenzij multi-game expliciet gewenst)
- Hele Ptero location/allocation-complexiteit in één klap

---

## Volgende actie

Zet `ACTIVITY_WEBHOOK_URL` (+ optioneel `ALERT_EMAIL` / `SMTP_*`) voor Discord-
alerts, en `MOLLIE_API_KEY` als je checkout live wilt. Installeer de panel-DB
backup-timer (`sudo bash scripts/install-panel-backup-cron.sh`). Eggs / mounts /
locations / Redis blijven optioneel.
