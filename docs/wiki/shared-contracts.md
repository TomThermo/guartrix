# Shared contracts

`packages/shared` is the contract layer used across the panel API, web UI, and daemon. It is where Guartrix defines stable payload shapes, permissions, activity action keys, daemon JWT helpers, and license-ticket verification logic.

## Why this package matters

Without `packages/shared`, the panel and daemon would drift on:

- server and node payload shapes
- file/stat and database responses
- permission strings
- activity action keys
- daemon JWT format
- license claims and daemon tickets

## Main areas

### Shared types

`types/server.ts`, `types/nodes.ts`, `types/files-stats.ts`, `types/databases.ts`, `types/schedules.ts`, `types/auth.ts`

These files define canonical structures for:

- server metadata and status
- node metadata and health
- file manager responses
- stats payloads
- database objects
- schedule/task payloads
- auth-related responses

### Permissions

`permissions.ts`

This is the source of truth for permission names used by:

- subusers
- client API keys
- UI permission pickers
- backend authorization checks

Permissions are grouped conceptually by capability area such as control, files, backups, schedules, allocations, and audit access.

### Activity taxonomy

`activity.ts`

Defines stable activity categories and action keys so the API, notifier, and UI can agree on how an event is labeled and whether it is critical.

### Daemon JWT contract

`daemon-jwt.ts`

Defines how short-lived daemon JWTs are signed and verified, including claim expectations such as audience and node identity.

### License verification contracts

`license-signing.ts` and `license-ticket.ts` define the verification helpers that let both the panel and daemon verify signed claims using the shipped public key, without embedding the private issuer in this repository.

### API key and application contracts

`api-keys.ts` and `application-api.ts` define token naming conventions and Application API scope semantics shared across admin automation surfaces.

### Runtime policy helpers

`java.ts`
`version.ts`
`world-seed-urls.ts`
`bytes.ts`
`safe-url.ts`

These are smaller shared policy or formatting helpers that still affect externally visible behavior (including markdown/UI link host allowlists shared with API SSRF checks).

### Daemon ↔ panel events

`types/daemon-events.ts` — typed multiplexed daemon `/events` WebSocket payloads (`status`, `players`, `output`, `stats`, `hello`, `error`) plus `PanelBusPayload` for Redis fan-out between API replicas. Parse with `parseDaemonEventMessage()` on the bridge ingress.

## Contract boundaries

The shared package is not a replacement for the full DB schema or route layer. Instead it expresses the reusable parts of the public/internal contract:

- payload shapes
- permission semantics
- signed token/claim verification
- stable event names

## Related

- [API and surface map](api-surface-map.md)
- [Auth and session internals](auth-and-session-internals.md)
- [License flow internals](license-flow-internals.md)
- [Client API](client-api.md)
