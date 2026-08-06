# Upgrade to Guartrix 1.1.0

From **1.0.x → 1.1.0** on an existing panel checkout (operator or customer install).

## What 1.1.0 means

Control-plane scale work for **~100 nodes / ~1000 servers** on one strong panel:

- Batched schedules / backups / disk-watch (1.0.165)
- Paginated lists + Admin Status cache (1.0.165)
- Daemon stats history + node→node transfers (1.0.166)
- Redis backup busy lock (1.0.167)
- Daemon `/events` single-primary + reconnect backoff (1.0.168)
- Server list indexes, separate UI read rate-limit budget, ops docs (1.1.0)

## Steps

1. **Backup** the panel DB and `data/` (especially `node-tokens`, sessions, license).

2. **Pull / unpack** 1.1.0 (git pull or new download zip).

3. **Env** — merge new knobs from [`.env.example`](../../.env.example). Important for scale:

| Key | Notes |
|-----|--------|
| `API_SESSION_RATE_LIMIT` | Default 600/min per user (mutations + general) |
| `API_SESSION_READ_RATE_LIMIT` | Default ~1800/min for dashboard poll GETs |
| `ACTIVITY_LOG_RETENTION_DAYS` | Default 90; `0` = forever |
| `BACKUP_BUSY_TTL_MS` | Redis backup lock TTL (multi-API) |
| `DAEMON_BRIDGE_*` | Bridge lock / reconnect (multi-API) |
| `REDIS_URL` | **Only** if you run multiple API replicas |
| `PRISMA_SLOW_MS` | Optional; set `200` while tuning MySQL |

4. **Migrate:**

```bash
npm run db:generate
bash scripts/db-migrate.sh
```

5. **Rebuild & restart** (operator):

```bash
bash scripts/build-out.sh
bash scripts/package-download-bundle.sh --skip-build   # if you publish /download
bash build/start.sh
```

Customer systemd installs: rebuild/restart units per [operations.md](operations.md).

6. **Smoke:**

```bash
bash scripts/scale-smoke.sh
curl -sf http://127.0.0.1:3001/api/ready
curl -sf http://127.0.0.1:8081/ready
```

## Hardware / network (still required)

Software is scale-ready; the host must be too:

- Strong panel CPU/RAM/disk + solid MySQL
- Every node reachable from the panel on the daemon port
- Redis only for multi-API HA (sessions, rate limits, bridge lock, event bus)

See [scaling.md](scaling.md) and [scale-100n-1000c-roadmap.md](../scale-100n-1000c-roadmap.md).

## Known limits in 1.1

- World transfers prefer node→node; **MySQL dumps** on transfer may still briefly use panel temp
- Stats history lives on the **daemon** (lost if that node restarts)
- Not a substitute for load-testing *your* fleet size before go-live
