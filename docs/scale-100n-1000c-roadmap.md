# Scale roadmap — 100 nodes / 1000 customers

**Status:** yellow → target green on one strong panel  
**Product:** Guartrix 1.0.164+  
**Assumption:** ~100 daemons, ~1000 accounts, ~1k–5k game servers  

Nodes already scale. This roadmap fixes the **control-plane**.

Interactive Cursor canvas (IDE): `.cursor/canvases/scale-100n-1000c-roadmap.canvas.tsx`  
Open via **Command Palette → Open Canvas** (Cursor 3.1+), or open that file in the tree.

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
| 8 | Stats-history | open | Uit heap/`data/stats-history` → Redis/DB of alleen daemon | `stats-history.ts` |
| 9 | Mineflayer bots | **cancelled** | Feature removed from product (no bot worker / admin bots tab) | — |
| 9b | busyServers backup lock | open | In-process `busyServers` Set in backup flows — still needs Redis or sticky primary API under multi-API | `servers/backups.ts` |
| 10 | Transfers | open | Node→node / object storage; geen panel-staging | `transfer.ts`, `transfer-jobs.ts` |

## Fase 4 — Daemon bridges @ 100 nodes (P1)

| # | Item | Wat | Files |
|---|------|-----|-------|
| 11 | Bridge sharding | Niet elke replica × 100 `/events`; shard of single-primary + Redis fan-out | `daemon-events.ts` |
| 12 | Reconnect backoff | Geen reconnect-storm na panel-restart | `daemon-events.ts`, `daemon-client-core.ts` |

## Ops / DB (parallel)

| # | Item | Wat |
|---|------|-----|
| 13 | MySQL indexes + activity retention | `Server(ownerId/nodeId)`, schedules, `PRISMA_SLOW_MS` |
| 14 | Redis sessions (optioneel HA) | Lost O(N)-jobs **niet** op; wel multi-API sessions |
| 15 | Panel-host sizing + netwerk | Alle nodes `:8081` bereikbaar |
| 16 | Rate limits vs UI-polls | List-endpoints mogen 600/min niet opeten |

## Bewust skip

- 100 aparte panels  
- Redis Cluster/Sentinel als eerste stap  
- Egg-marketplace / Ptero 1:1  

---

## Definition of done

**Must:** batch scheduler/backups, disk-watch niet O(all), gepagineerde lists, gecachte Admin Status.  
**Should:** stats niet in API-heap, transfers zonder panel-temp, bridges niet N×100.  
**Ops:** indexed MySQL, Redis alleen bij multi-API.

Zie ook: [Scaling](wiki/scaling.md).
