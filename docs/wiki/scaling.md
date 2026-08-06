# Scaling

## Supported model

**Scale out daemons (nodes). Keep one panel API** unless you enable Redis HA.

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
| `data/transfers/` | In-flight **server transfer** jobs (also mirrored to Redis when enabled) |
| `data/rate-limits/` | Optional file rate-limit counters (`RATE_LIMIT_STORE=file`) |

Two API processes on different hosts without Redis (or a shared `DATA_DIR`) will **duplicate scheduled ticks**, break consoles, and split sessions / transfer progress.

## Multi-API / panel HA (Redis)

Opt in at install (**Docker Redis** `guartrix-redis` or **external** `REDIS_URL`) or set env manually:

```bash
REDIS_URL=redis://127.0.0.1:6379/0
REDIS_ENABLED=1
SESSION_STORE=redis
RATE_LIMIT_STORE=redis
# optional
SCHEDULER_LOCK_TTL_MS=15000
```

Requires optional dependency `ioredis` (`npm i ioredis -w @msm/api` — already an optionalDependency).

When Redis is connected, the panel uses it for:

| Concern | Behaviour |
|---------|-----------|
| Sessions | `RedisSessionStore` |
| Rate limits | Shared sliding-window counters |
| Transfer jobs | Keys `guartrix:transfer:*` (+ disk mirror) |
| Schedules / backups | One API holds `guartrix:scheduler:lock` |
| Console / daemon events | Pub/sub `guartrix:events` for cross-replica fan-out |

Admin → **Status** shows Redis health; Admin → **Settings → Security** can **Test Redis connection**.

Without Redis, behaviour stays single-API (file sessions / file rate limits).

### Option A — shared session directory (NFS)

Still valid for sessions only: mount the same `data/sessions` (POSIX rename semantics). Object storage (S3) is **not** enough. Transfers, rate limits, locks, and live consoles still need Redis (or you accept single-API limits).

## Do you need Redis?

**Not for multi-node Minecraft.** Add nodes via System → Add node.

Redis is for **multiple panel API replicas** behind a load balancer.

## Guidance

| Goal | Approach |
|------|----------|
| More Minecraft capacity | Add nodes via System → Add node |
| More admins / light panel traffic | Bigger single panel VPS is enough |
| Shared logins + rate limits across API replicas | `SESSION_STORE=redis` + `RATE_LIMIT_STORE=redis` + `REDIS_URL` |
| Full panel HA | Redis as above (sessions, rate limits, transfers, scheduler lock, event bus) |

## Related

- [Architecture](architecture.md)
- [Install panel](install-panel.md)
- [Install nodes](install-nodes.md)
- [Env reference](env-reference.md)

## Large installs (100 nodes / 1000 customers)

Work items: [Scale roadmap](../scale-100n-1000c-roadmap.md) (and IDE canvas `.cursor/canvases/scale-100n-1000c-roadmap.canvas.tsx`).
