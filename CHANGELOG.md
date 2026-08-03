# Changelog

All notable changes to Guartrix are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

-

## [1.0.36] — 2026-08-03

- Prisma **migrations** instead of `db push` for installs/upgrades (`20260803120000_init`, `scripts/db-migrate.sh`, legacy baseline)
- Unit tests for sealed game DB passwords (`db-password.test.ts`)
- Docs/install/download INSTALL paths use `bash scripts/db-migrate.sh`

## [1.0.35] — 2026-08-03

- Deduplicate player-history into `@msm/node-agent` (API imports the shared module)
- React `ErrorBoundary` around panel routes with retry / dashboard fallback
- Structured pino logging foundation for the API (`LOG_LEVEL`, request ids)
- Prisma client: warn/error query log + `DATABASE_URL` pooling notes
- Explicit scrypt cost params for password hashing (compatible with existing hashes)
- CSP: document `style-src 'unsafe-inline'` and add `style-src-attr`
- Docs: OpenAPI version bump, English roadmap summary, this changelog

## [1.0.34] — 2026-08-03

- Compact server header **Manage** menu on small screens

## [1.0.33] — 2026-08-03

- Collapse crowded top nav into **Admin** and **Account** menus

## [1.0.32] — 2026-08-03

- Security hardening: SSRF guards, file jail, PATCH authorization, Docker capability tightening
