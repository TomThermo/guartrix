# Development

## Prerequisites

- Node 22+
- MySQL reachable via `DATABASE_URL`
- Docker (for full daemon features)

## Run locally

```bash
cp .env.example .env
npm install
npm run db:generate && npm run db:push

# Terminal 1
npm run dev:api

# Terminal 2
npm run dev:web

# Terminal 3 (optional)
npm run dev:daemon
```

- UI: http://127.0.0.1:5173 (Vite proxies `/api` → `:3001`)
- API: http://127.0.0.1:3001

Keep `HOST=127.0.0.1` so the API is not exposed on the public interface.

## Build & prod-like restart

```bash
npm run build              # readable tsc output (dev / debug)
bash scripts/start.sh
```

For **commercial / sellable** installs (minified Node bundles, no sources in the zip):

```bash
npm run build:out          # → ./build + bash build/start.sh
npm run package:release    # → dist-release/guartrix-*.tar.gz
```

Details: [Release builds](release-builds.md).

## Workspace tips

- Shared types: `packages/shared` — rebuild when changing exports (`npm run build -w @msm/shared`).
- Daemon logic lives in `packages/node-agent`; `apps/daemon` is the process entrypoint.
- Docs: update [README](../../README.md) and this wiki when behaviour users rely on changes (see Cursor rule `keep-docs-updated`).
