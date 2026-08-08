# Prod-web and downloads

> **Note:** Release packaging / download-gate scripts live on the operator host only and are not part of the public git tree.


`scripts/prod-web.mjs` is the production web edge for Guartrix. It serves the built web UI, proxies API and WebSocket traffic, manages HTTP/HTTPS behavior, and can optionally attach the password-protected `/download` experience on the operator host.

## Main responsibilities

Core files:

- `scripts/prod-web.mjs`
- `scripts/prod-web/config.mjs`
- `scripts/prod-web/env.mjs`
- `scripts/prod-web/server-bootstrap.mjs`
- `scripts/prod-web/request-router.mjs`
- `scripts/prod-web/reverse-proxy.mjs`
- `scripts/prod-web/security-headers.mjs`
- `scripts/prod-web/tls-context.mjs`
- `scripts/prod-web/static-files.mjs`

Optional operator-only module:

- `scripts/prod-web-download.mjs`

## What prod-web does

The production edge process is responsible for:

- serving `apps/web/dist`
- **gzip / brotli** for compressible static assets (and HTML), plus weak **ETag** / `304` for cache revalidation
- reverse proxying `/api` and `/ws`
- redirecting HTTP to HTTPS when enabled
- applying security headers and CSP behavior
- looking up cert/key material for TLS
- optionally handling daemon/public-node hostname proxying
- optionally wiring in `/download`

If a build step left sibling `.br` / `.gz` files next to an asset, those are preferred over on-the-fly compression.

## `/download` boundary

The password-protected download page is an operator-host feature, not something meant to ship inside customer packages.

That boundary exists because the operator host may publish:

- panel zip
- daemon zip
- web/api artifacts
- env templates
- bundle manifest

but customer packages should not contain the server-side download gate code itself.

## DNS and TLS notes

Prod-web is also where DNS/TLS-facing operator behavior becomes real:

- public panel host
- optional download host
- optional daemon public host on the local node
- certificate lookup and reload conventions

This is why changes in Admin settings that affect public host or HTTPS require a restart of the production stack.

## Related

- [Operations](operations.md)
- [Install the panel](install-panel.md)
- [Build and release internals](build-and-release-internals.md)
- [Release builds](release-builds.md)
