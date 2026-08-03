# Scaling

## Supported model

**Scale out daemons (nodes). Keep one panel API.**

Example that works well: **~10 nodes**, **~100 users**, dozens of game servers — one API process, one MySQL, local `data/` on the panel host.

```
Users ──► 1× panel (web + API + MySQL)
              ├── HTTP to each daemon
              └── 1 WebSocket event bridge per node
Nodes ──► Minecraft containers + SFTP + optional MySQL
```

Bottlenecks are usually **RAM/CPU on game nodes**, not the panel.

## Local disk state (single API)

On one panel host these live under `DATA_DIR` (default `./data`) and are **not** shared across machines:

| Path | Purpose |
|------|---------|
| `data/sessions/*.json` | Login sessions (`FileSessionStore`) |
| `data/transfers/` (or similar job files) | In-flight **server transfer** jobs hydrated on API boot |
| `data/rate-limits/` | Optional file rate-limit counters (`RATE_LIMIT_STORE=file`) |

Two API processes on different hosts without sharing that state will **duplicate scheduled ticks**, break consoles (per-process WebSocket bridges), and lose or split sessions / transfer progress.

## Multi-API / panel HA

**Still not a first-class product mode.** If you must run more than one API replica:

### Option A — shared session directory (NFS / shared volume)

1. Mount the same directory on every API host (e.g. NFS, CephFS, cloud file share).
2. Point `DATA_DIR` (or at least sessions) at that mount so `data/sessions` is identical everywhere.
3. Use a **POSIX-compatible** share (rename + flock semantics). Object storage (S3) is **not** enough for `FileSessionStore`.
4. Transfer job files and rate-limit files need the same shared `DATA_DIR` (or you accept broken transfers / split limits).
5. You still need **leader election** (or a single worker) for backup/schedule timers and a shared event bus for live console — those are **not** solved by NFS alone.

### Option B — Redis sessions

```bash
# .env
SESSION_STORE=redis
REDIS_URL=redis://127.0.0.1:6379/0
```

Install the optional client on the API package:

```bash
npm i ioredis -w @msm/api
```

When `SESSION_STORE=redis` and `REDIS_URL` is set, the API uses `RedisSessionStore` if `ioredis` loads; otherwise it **falls back to file sessions** and logs a warning.

Redis covers **sessions only**. Transfer jobs, rate limits, schedule ticks, and daemon event fan-out remain process-local until further work.

## Do you need Redis?

**Not for multi-node Minecraft.** Redis (or NFS for sessions) is only relevant if you want **multiple panel API replicas**.

Today the panel also keeps in-process:

- Per-node event WebSockets and live console fan-out
- Backup mutex + scheduled-task tick (single `setInterval`)

## Guidance

| Goal | Approach |
|------|----------|
| More Minecraft capacity | Add nodes via System → Add node |
| More admins / light panel traffic | Bigger single panel VPS is enough |
| Shared logins across API replicas | NFS on `data/sessions` **or** `SESSION_STORE=redis` + `REDIS_URL` |
| Full panel HA | Not implemented — needs shared sessions **plus** leader election + event bus |

## Related

- [Architecture](architecture.md)
- [Install nodes](install-nodes.md)
- [Env reference](env-reference.md)
