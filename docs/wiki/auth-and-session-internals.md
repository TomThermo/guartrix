# Auth and session internals

This page documents the authentication surfaces that sit behind login, registration, API keys, app passwords, subusers, daemon auth, and machine automation.

## Auth surfaces at a glance

Guartrix uses several different auth mechanisms for different trust boundaries:

| Mechanism | Used by |
|-----------|---------|
| Session cookie | Browser UI |
| Personal API key `gt_…` | End-user scripts and CI |
| App password `gtap_…` | SFTP and external desktop clients |
| Application API key `gta_…` | Admin-controlled server-to-server automation |
| Daemon JWT | Panel to daemon control traffic |
| Invite / reset / verify tokens | Account lifecycle flows |

## Browser sessions

Browser auth is backed by the API auth routes and session store implementation:

- `apps/api/src/routes/auth.ts`
- `apps/api/src/auth/session-store.ts`
- `apps/api/src/auth/csrf.ts`

Important behavior:

- sessions regenerate on login
- password reset invalidates active sessions
- CSRF checks apply to mutating cookie-authenticated API routes
- session storage can be file-backed or Redis-backed depending on deployment mode

## Registration and recovery

The account lifecycle includes:

- registration
- email verification
- forgot-password
- password reset
- invite acceptance
- admin-created accounts

These flows use token rows in Prisma and mail delivery through the API mail layer.

## TOTP and recovery

TOTP support is implemented through:

- `apps/api/src/routes/two-factor.ts`
- `apps/api/src/auth/totp.ts`

Important behavior:

- secrets are sealed at rest
- recovery codes are one-time values
- some roles can be forced to enrol using `TWO_FACTOR_REQUIRED_ROLES`
- admins can reset 2FA for a user

## Client API keys

Personal API keys:

- use the `gt_` prefix
- are created from the account security page
- carry permission scopes similar to subuser permissions
- can optionally be limited to specific servers

See [Client API](client-api.md).

## App passwords

App passwords:

- use the `gtap_` prefix
- are intended for SFTP or desktop tooling
- avoid reusing the main account password in third-party clients

They are not the same as API keys and do not replace browser sessions.

## Application API keys

Application API keys:

- use the `gta_` prefix
- are managed by admins
- are intended for external billing panels or automation
- use scope names distinct from client server permissions

See [Billing internals](billing-internals.md) and [Application API & Mollie](application-api.md).

## Subusers and permissions

Subusers extend account auth into delegated per-server access. Effective permission comes from:

- account role and ownership
- subuser permission strings
- client API key scopes layered on top

The canonical permission vocabulary lives in `packages/shared/src/permissions.ts`.

## Daemon auth

Panel-to-daemon auth is intentionally separate from end-user auth:

- the panel stores a long-lived node secret
- the panel sends short-lived daemon JWTs for requests
- the daemon can optionally allow legacy bearer behavior only when explicitly enabled

Relevant files:

- `apps/api/src/nodes/daemon-client.ts`
- `apps/api/src/nodes/node-token-vault.ts`
- `apps/daemon/src/auth.ts`
- `packages/shared/src/daemon-jwt.ts`

## Related

- [Accounts & quotas](accounts-and-quotas.md)
- [Client API](client-api.md)
- [Application API & Mollie](application-api.md)
- [Shared contracts](shared-contracts.md)
