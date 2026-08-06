# License flow internals

This page explains the internal mechanics behind the user-facing [Licensing](licensing.md) page.

## Scope

This repository contains the panel-side license client, daemon ticket verification, and shared public-key helpers.

This repository does **not** include the private license issuer or signing private key.

## Main implementation areas

- `apps/api/src/routes/license.ts`
- `apps/api/src/license/license.ts`
- `apps/api/src/license/license-validate.ts` (validate core) + `license-store.ts` / `license-version.ts` / `license-watcher.ts` (barrel via `license.ts`)
- `apps/api/src/license/license-quota.ts`
- `apps/daemon/src/license-gate.ts`
- `packages/shared/src/license-signing.ts`
- `packages/shared/src/license-ticket.ts`

## Validate flow

At a high level:

1. The panel sends the configured license key and current usage to the license API.
2. The license API returns signed claims.
3. The panel verifies those claims with the public key.
4. The panel derives effective limits/features and stores current state.
5. The panel pushes a daemon ticket to each node.
6. Each daemon verifies the ticket locally and applies start-time enforcement.

This is why bypassing the panel UI alone is not enough to fully bypass license enforcement.

## Usage inputs

The panel reports product usage such as:

- nodes in use
- server count
- memory usage / allowances

Those values are relevant because commercial licenses gate capacity, while the free tier has hard-coded fallback caps.

## Grace and failure handling

If the remote license API is temporarily unavailable:

- the panel can keep a grace-valid state for a limited window
- repeated failures can raise alerts
- expiry or hard invalidation eventually collapses back to free-tier behavior

This allows the product to survive short control-plane outages without instantly hard-failing every customer node.

## Daemon enforcement

The daemon does not blindly trust the panel. It verifies a signed ticket using the shared public key and then blocks starts/restarts that exceed effective limits.

Important consequences:

- free-tier fallback still applies on the node
- starts can be denied even if a container existed before
- panel and daemon both participate in the same enforcement story

## Feature flags and UI impact

Licensing is not only about quantity caps. The license surface can also affect:

- visible admin or server tabs
- larger quota ceilings
- feature availability for commercial-only areas

The exact feature set is determined by the validated claims, not by hardcoded assumptions in every page.

## Security boundary

The issuer stays private and out of this repository. Only public verification material belongs here.

Do not add:

- issuer source code
- signing private PEM files
- issuer databases

## Related

- [Licensing](licensing.md)
- [Shared contracts](shared-contracts.md)
- [Daemon API](daemon-api.md)
