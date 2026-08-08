# Scale roadmap — 100 nodes / 1000 customers

**Status:** **green** on one strong panel (software control-plane ready as of **1.1.0**)  
**Product:** Guartrix 1.1.0+  
**Assumption:** ~100 daemons, ~1000 accounts, ~1k–5k game servers  

Nodes already scale. This roadmap fixed the **control-plane**. Remaining risk is **your** hardware, MySQL, and network — not missing panel O(N) jobs.

Interactive Cursor canvas (IDE): `.cursor/canvases/scale-100n-1000c-roadmap.canvas.tsx`  
Open via **Command Palette → Open Canvas** (Cursor 3.1+), or open that file in the tree.

Upgrade notes: [wiki/upgrade-to-1.1.md](wiki/upgrade-to-1.1.md) · Smoke: `bash scripts/scale-smoke.sh`

---

## Fase 1 — O(N) panel-jobs (P0)

| # | Item | Status | Wat | Files |
|---|------|--------|-----|-------|
| 1 | Due-schedules batch | **done (1.0.165)** | Indexed `nextRunAt` query + batch cap; DB nextRunAt preserved | `scheduled-tasks.ts` |
| 2 | Backup-schedules indexed | **done (1.0.165)** | Prisma `BackupSchedule` + file dual-write/migrate | `backup-schedule.ts`, migration |
| 3 | Disk-watch queue | **done (1.0.165)** | Paged + concurrency + Redis leader lock | `disk-watch.ts` |

## Fase 2 — Lijsten & admin API (P0)

| # | Item | Status | Wat | Files |
|---|------|--------|-----|-------|
| 4 | Server lists pagineren | **done (1.0.165)** | `?limit=&offset=` → `{ servers, total }`; dashboard Load more | `dashboard.ts`, `DashboardPage` |
| 5 | Application API limits | **done (1.0.165)** | Default limit 100 + total | `application/users`, `servers-core` |
| 6 | Admin Status cache | **done (1.0.165)** | 10s cache + node probe concurrency | `admin/status.ts` |
| 7 | Dashboard lazy | **done (1.0.165)** | Page size 100 + load more | `DashboardPage` |

## Fase 3 — Live state uit API-proces (P1)

| # | Item | Status | Wat | Files |
|---|------|--------|-----|-------|
| 8 | Stats-history | **done (1.0.166)** | Daemon in-memory 1h ring; panel proxies `GET .../stats/history` | `node-agent/stats-history.ts`, daemon route |
| 9 | Mineflayer bots | **cancelled** | Feature removed from product (no bot worker / admin bots tab) | — |
| 9b | busyServers backup lock | **done (1.0.167)** | Redis `SET NX` + TTL (`BACKUP_BUSY_TTL_MS`); local Set fallback | `backup-busy.ts` |
| 10 | Transfers | **done (1.0.166)** | Dest pulls archive from source (`deploy-from`); panel staging fallback | `transfer.ts`, daemon `files.ts` |

## Fase 4 — Daemon bridges @ 100 nodes (P1)

| # | Item | Status | Wat | Files |
|---|------|--------|-----|-------|
| 11 | Bridge primary + Redis fan-out | **done (1.0.168)** | Only Redis bridge-lock leader opens `/events`; others use bus | `daemon-events.ts`, `redis.ts` |
| 12 | Reconnect backoff | **done (1.0.168)** | Exp backoff + jitter + connect stagger | `daemon-events.ts` |

## Ops / DB (parallel)

| # | Item | Status | Wat |
|---|------|--------|-----|
| 13 | MySQL indexes + activity retention | **done (1.1.0)** | `Server(createdAt)`, `(ownerId,createdAt)`; retention via `ACTIVITY_LOG_RETENTION_DAYS` + hourly prune; `PRISMA_SLOW_MS` |
| 14 | Redis sessions (optioneel HA) | **documented** | Not required for single-API 100n; required for multi-API |
| 15 | Panel-host sizing + netwerk | **documented** | Strong panel + all nodes `:8081` reachable — see upgrade + scaling wiki |
| 16 | Rate limits vs UI-polls | **done (1.1.0)** | Separate `API_SESSION_READ_RATE_LIMIT` for dashboard GETs |

## Bewust skip / later

- 100 aparte panels  
- Redis Cluster/Sentinel als eerste stap  
- Egg-marketplace / clone of another panel 1:1  
- ~~Peer MySQL dump on transfer~~ → **done 1.1.2** (`restore-from`; panel SQL staging = fallback)

---

## Definition of done

**Must:** batch scheduler/backups, disk-watch niet O(all), gepagineerde lists, gecachte Admin Status.  
**Should:** stats niet in API-heap, transfers zonder panel-temp (fallback), backup busy, bridges niet N×R, list indexes, read-poll rate budget.  
**Ops:** retention + sizing docs + `scale-smoke.sh`.

Zie ook: [Scaling](wiki/scaling.md) · [Upgrade 1.1](wiki/upgrade-to-1.1.md).
