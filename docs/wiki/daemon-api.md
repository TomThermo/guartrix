# Daemon API

The daemon is the node-local control plane that the panel talks to for actual host work. It lives in `apps/daemon` and delegates most sensitive operations to `packages/node-agent`.

## Responsibilities

The daemon is responsible for:

- container lifecycle and command execution
- live console and event streams
- file access on the node
- backup/archive movement
- node-local MySQL operations
- firewall open/close actions
- SFTP server hosting
- resource and status reporting
- license ticket enforcement on starts

## Public vs protected surfaces

The daemon intentionally exposes a small unauthenticated health surface and a larger authenticated control surface.

### Usually unauthenticated or locally safe

- `/health`
- `/ready`
- optional local metrics access, depending on configuration

### Authenticated control surfaces

- server power and command endpoints
- file APIs
- MySQL APIs
- firewall APIs
- WebSocket/event endpoints
- license ticket update flows

Auth is described in [Auth and session internals](auth-and-session-internals.md).

## Auth model

The panel stores a long-lived per-node shared secret. On the wire, it sends short-lived HS256 daemon JWTs rather than sending that raw secret on every request.

Important notes:

- raw bearer mode is legacy-compatible only when explicitly allowed
- tokens carry audience and node-binding claims
- SFTP callback tokens use a different audience than daemon control tokens

Code anchors:

- `apps/daemon/src/auth.ts`
- `packages/shared/src/daemon-jwt.ts`
- `apps/api/src/nodes/daemon-client.ts` (barrel re-exporting `daemon-client-*.ts` domain modules)

## Main route groups

### File routes

`apps/daemon/src/routes/files.ts`

Node-side operations for:

- listing
- reading/writing
- upload/download
- archive create/extract
- deploy/export
- destructive wipes

### MySQL routes

`apps/daemon/src/routes/mysql.ts`

Handles:

- database create/delete
- dump and restore
- MySQL log access
- daemon-facing database metadata work

### Firewall routes

`apps/daemon/src/routes/firewall.ts`

Used for open/close flows when allocations or SFTP exposure change.

### WebSocket routes

`apps/daemon/src/routes/websockets.ts`

Used for:

- live console output
- status changes
- event fan-out for the panel
- live `{ type: "stats" }` samples

### Stats routes

Alongside power/status endpoints, the daemon serves:

- live cached stats for a running server
- `GET /servers/:id/stats/history` — ~1h in-memory ring (`packages/node-agent/src/stats-history.ts`); **lost on daemon restart**

The panel proxies history as `GET /api/servers/:id/stats/history`.

## Lifecycle model

The daemon is intentionally restart-tolerant:

- running Minecraft containers are expected to survive daemon process restarts
- the daemon reattaches to orphaned containers and restores event observation
- graceful daemon shutdown should avoid killing live game servers

This is one of the most important operational behaviors to understand when troubleshooting.

## Metrics and readiness

The daemon exposes health/readiness separately:

- liveness answers whether the process is up
- readiness answers whether Docker and key dependencies are usable

Prometheus metrics can also be exposed with token or loopback restrictions.

## Related

- [Node-agent internals](node-agent-internals.md)
- [License flow internals](license-flow-internals.md)
- [Operations](operations.md)
- [Install nodes](install-nodes.md)
