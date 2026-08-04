# Development

## Prerequisites

- Node 22+
- MySQL reachable via `DATABASE_URL`
- Docker (for full daemon features)

## Run locally

```bash
cp .env.example .env
npm install
npm run db:generate && bash scripts/db-migrate.sh

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

### Dev MySQL (Docker Compose)

```bash
docker compose -f docker-compose.dev.yml up -d
# DATABASE_URL=mysql://guartrix:guartrix@127.0.0.1:3306/guartrix_panel
```

Then `bash scripts/db-migrate.sh` and start the API/web as above.


Schema changes: edit `apps/api/prisma/schema.prisma`, then
`npm run db:migrate:dev -w @msm/api` (creates a migration). Installs and
upgrades use `bash scripts/db-migrate.sh` / `npm run db:migrate` (`prisma migrate deploy`).
`db:push` remains only for throwaway local prototyping — do not use it on
customer or operator hosts.

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

## Tests & CI

Unit tests use [Vitest](https://vitest.dev/) at the repo root (`apps/api` + `packages/*`):

```bash
npm test              # vitest run (CI gate)
npm run test:watch    # vitest watch mode
npm run lint          # Biome check (formatter + lint)
```

GitHub Actions (`.github/workflows/ci.yml`) on push/PR to `main`: install → Prisma generate → build shared → typecheck API/web → `npm test` → `npm audit` (high+, non-blocking) → `npm run build`.

Playwright smoke under `e2e/` is **optional** and skipped unless `E2E_BASE_URL` is set:

```bash
npx playwright install chromium
E2E_BASE_URL=http://127.0.0.1:80 \
  E2E_USER=admin E2E_PASSWORD='…' \
  npx playwright test
```

Health probes: `/api/health` (liveness) vs `/api/ready` (DB + local daemon). Daemon: `/health` vs `/ready` (Docker). Watchdog checks both.

## i18n

The web UI uses a tiny custom i18n layer (no i18next):

- Catalogs: `apps/web/src/i18n/locales/en.ts` and `nl.ts` (nested objects)
- Core API: `apps/web/src/i18n/index.ts` — `t(key)`, `getLocale()`, `setLocale()`, persisted in `localStorage` key `guartrix.locale` (default from `navigator.language`: `nl*` → `nl`, else `en`)
- React: wrap with `I18nProvider` / `useI18n()` from `apps/web/src/i18n/react.tsx` (wired in `main.tsx`). Changing locale updates `document.documentElement.lang`.
- Language picker: Account → Security.

UI chrome across pages, server tabs/panels, and modals is keyed in both locale files. Call `t("section.key")` where needed; prefer `{name}` placeholders via `t(key, { name })`. Legal page bodies stay English; Minecraft property/permission technical labels often stay English too. When adding strings: update **both** `en.ts` and `nl.ts`, then wire `useI18n()` / `t()`.

## Workspace tips

- Shared types: `packages/shared` — rebuild when changing exports (`npm run build -w @msm/shared`).
- Daemon logic lives in `packages/node-agent`; `apps/daemon` is the process entrypoint.
- Docs: update [README](../../README.md) and this wiki when behaviour users rely on changes (see Cursor rule `keep-docs-updated`).
- OpenAPI: keep [`docs/openapi.yaml`](../openapi.yaml) `info.version` in sync with the product version in root `package.json` / `VERSION` on each release bump. Drift check: `npm run check:openapi` (coverage floor + fail on stale yaml paths; `--strict` requires full coverage).
