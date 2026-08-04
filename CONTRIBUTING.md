# Contributing

Guartrix is primarily an operator-hosted product. Contributions that improve reliability, docs, or security are welcome.

> This codebase was largely AI-generated — review carefully and prefer small, testable changes.

## Prerequisites

- Node.js **22+**
- Docker (daemon features)
- MySQL reachable via `DATABASE_URL` (see [Install](docs/wiki/install-panel.md) / [Development](docs/wiki/development.md))

## Local setup

```bash
cp .env.example .env
# set SESSION_SECRET, ADMIN_PASSWORD, DATABASE_URL / MYSQL_*, PUBLIC_*
npm install
npm run db:generate
bash scripts/db-migrate.sh
npm run dev:api      # :3001
npm run dev:web      # :5173 (proxies /api)
npm run dev:daemon   # optional local node
```

Production-style on this tree: `npm run build && bash scripts/start.sh`.

## Checks

```bash
npm test
npm run typecheck -w @msm/api
npm run typecheck -w @msm/web
```

CI: `.github/workflows/ci.yml` (install → Prisma generate → typecheck → test → build).

## Docs

When behaviour or ops change, update in the **same** change:

1. Relevant page under [`docs/wiki/`](docs/wiki/README.md)
2. Root [`README.md`](README.md) if the hub blurb is stale
3. [`.env.example`](.env.example) + [`docs/wiki/env-reference.md`](docs/wiki/env-reference.md) when env knobs change
4. Public in-app wiki mirror: `apps/web/src/wiki/wiki-content.ts` when operators need the same content on `/wiki`

## Operator scripts (high level)

| Script | Role |
|--------|------|
| `scripts/start.sh` | Stop old processes, health-check, start API/web/daemon + watchdog |
| `scripts/build-out.sh` | Stage release tree under `build/` |
| Download packaging (operator host) | Customer `/download` zips |
| `scripts/install-panel.sh` / `install-daemon.sh` | Host installers |
| `scripts/db-migrate.sh` | Prisma migrate deploy |
| `scripts/monitor.sh` | Watchdog (invoked by start) |
| `scripts/lib.sh` | Shared shell helpers for the scripts above |

Details: [Operations](docs/wiki/operations.md) · [Release builds](docs/wiki/release-builds.md) · [API surface map](docs/wiki/api-surface-map.md).

## License

MIT — see [`LICENSE`](LICENSE).
