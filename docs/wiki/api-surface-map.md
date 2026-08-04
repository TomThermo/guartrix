# API and surface map

This page is a high-level index of where Guartrix features live. It complements the user guides by mapping UI pages, API route families, daemon routes, shared contracts, and operational scripts to their main responsibilities.

Use this page when you need to answer "where is this feature implemented?" before diving into [Architecture](architecture.md), [Development](development.md), or a subsystem page.

## Web UI pages

| Page | Purpose |
|------|---------|
| `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `VerifyEmailPage`, `InvitePage` | Public account entry, recovery, verification, and invite acceptance |
| `DashboardPage` | Server list, filters, quick actions, update/whitelist/player chips |
| `CreateServerPage` | Create new server or import an archive |
| `ServerDetailPage` | Main server workspace: console, files, SFTP, databases, network, backups, subusers, settings, players, bans, schedules, activity, resources, bots |
| `AccountSecurityPage` | TOTP, recovery codes, client API keys, app passwords, push, export/delete account, theme/locale |
| `AccountBillingPage` | End-user payments, subscriptions, plan purchases |
| `AdminBillingPage` | Plans, Application API keys, recent payments |
| `AdminSettingsPage` | Panel-wide settings overrides, SMTP, alerts, security flags, Redis status |
| `SystemSettingsPage` | Nodes, daemon connectivity, capacity, install/reinstall actions |
| `StatusLinePage` | Panel and node health overview |
| `UsersPage` | Admin user management, quotas, roles, 2FA reset |
| `AdminLicensePage` | License key, caps, features, revalidation, free-tier status |
| `AdminActivityPage` | Global audit stream |
| `TermsPage`, `PrivacyPage` | Legal documents |

## API route families

Routes below live under `apps/api/src/routes/`.

### Auth and account

| Route file | Main responsibility |
|------------|---------------------|
| `auth.ts` | Login, logout, registration, profile, admin user create/update/delete, quotas, role changes |
| `two-factor.ts` | TOTP enrolment, verification, recovery codes, disable/reset |
| `invites.ts` | Invite acceptance and invite-token lifecycle |
| `api-keys.ts` | Personal `gt_` client keys |
| `app-passwords.ts` | App/SFTP passwords (`gtap_…`) |
| `account-push.ts` | Web Push subscriptions and delivery preferences |
| `account-gdpr.ts` | Account export and self-delete |

### Server lifecycle and day-to-day control

| Route file | Main responsibility |
|------------|---------------------|
| `servers.ts` | Server read/detail payloads and general server access |
| `servers-dashboard.ts` | Dashboard summaries, filters, online counters |
| `servers-crud.ts` | Create, import, clone, reinstall, delete, ownership changes |
| `servers-power.ts` | Start, stop, restart, kill |
| `servers-settings.ts` | Runtime settings, properties, quotas, startup, Java, ownership-guarded mutations |
| `servers-world.ts` | World preset/seed settings and world-adjacent helpers |
| `servers-transfer.ts` | Cross-node move flow |
| `servers-addons.ts` | Addon browse/install/update/remove |
| `resource-pack.ts` | Resource-pack configuration |
| `servers-players.ts` | Player list and live presence |
| `player-actions.ts` | Whitelist, kick, ban, pardon, moderation actions |
| `tasks.ts` | Scheduled tasks and manual task runs |
| `logs.ts` | Server log file listing/download helpers |

### Data, files, and recovery

| Route file | Main responsibility |
|------------|---------------------|
| `files.ts` | In-panel file manager operations |
| `backups.ts` | Create, upload, download, restore, delete backups |
| `databases.ts` | Per-server MySQL database CRUD |
| `sftp-auth.ts` | Panel side of SFTP login verification |

### Node, networking, and infrastructure

| Route file | Main responsibility |
|------------|---------------------|
| `nodes.ts` | Node CRUD, connection tests, remote install, token rotation, daemon metadata |
| `allocations.ts` | Node port inventory and per-server allocation assignment |
| `status.ts` | Panel, daemon, and node status surfaces |
| `activity.ts` | Audit log queries |
| `admin-settings.ts` | Panel settings read/write and side effects |

### Billing, licensing, integrations

| Route file | Main responsibility |
|------------|---------------------|
| `billing.ts` | User billing, admin plans/payments, Mollie webhook and sync flows |
| `application.ts` | Machine API for external automation (`gta_…`) |
| `license.ts` | License status, key update, revalidation, free-tier state |
| `bots.ts` | Admin-only bot spawning and commands |
| `icon.ts` | Server icon upload/read helpers |

## API internals by domain

These code folders hold most of the behavior behind the route layer:

| Path | Focus |
|------|-------|
| `apps/api/src/auth/` | Sessions, CSRF, TOTP, password policy, application auth |
| `apps/api/src/servers/` | Provisioning, lifecycle, files, backups, schedules, players, moderation, stats, addons, modpacks |
| `apps/api/src/nodes/` | Daemon client, event bridge, remote install, token vault, Cloudflare DNS, firewall helpers |
| `apps/api/src/billing/` | Mollie integration, quota application, payment sync |
| `apps/api/src/license/` | Validation, quotas, signed claims, ticket generation |
| `apps/api/src/bots/` and `apps/api/src/bot-movement/` | Bot worker, command proxying, movement helpers |
| `apps/api/src/ws/` | Console, admin-log, and players WebSocket fan-out |

## Daemon route families

Routes below live under `apps/daemon/src/routes/`.

| Route file | Main responsibility |
|------------|---------------------|
| `files.ts` | Node-side file browser, uploads, downloads, archive operations, deploy/export |
| `mysql.ts` | Node-local MySQL CRUD, dump/restore, log streaming |
| `firewall.ts` | UFW open/close helpers for allocations and SFTP |
| `websockets.ts` | Console/event WebSocket surfaces |

The daemon entrypoint also provides health, readiness, server status/power/command/stats endpoints and embeds the SFTP server. See [Daemon API](daemon-api.md).

## Node-agent modules

`packages/node-agent/src/` is where the daemon's sensitive host logic actually lives.

| Module group | Purpose |
|--------------|---------|
| `docker.ts`, `docker-engine.ts`, `process-*` | Container create/start/stop/reattach lifecycle |
| `files.ts`, `safe-archive.ts`, `sftp-jail.ts`, `sftp-handlers.ts` | Jailed file access, archive safety, SFTP permissions |
| `mysql.ts` | Node-local MySQL helper and credentials handling |
| `firewall.ts` | UFW port management |
| `resource-monitor.ts`, `stats.ts`, `disk-usage.ts`, `disk-quota.ts`, `host-resources.ts` | Resource sampling and quota enforcement |
| `player-history.ts` | Join/leave and recent-player history |
| `config.ts`, `index.ts`, `default-icon.ts` | Runtime layout, boot wiring, defaults |

See [Node-agent internals](node-agent-internals.md).

## Shared package contracts

`packages/shared/src/` carries the cross-service contracts:

| Module | Purpose |
|--------|---------|
| `types/*` | Canonical shared payloads for servers, nodes, files/stats, databases, schedules, auth |
| `permissions.ts` | Permission taxonomy for subusers and client API keys |
| `application-api.ts`, `api-keys.ts` | Machine API scopes and token helpers |
| `daemon-jwt.ts` | Short-lived daemon JWT contract |
| `license-signing.ts`, `license-ticket.ts` | License claim and daemon ticket verification |
| `activity.ts` | Stable activity categories/action keys |
| `java.ts`, `version.ts`, `world-seed-urls.ts`, `bytes.ts` | Runtime policy helpers and shared utility metadata |

See [Shared contracts](shared-contracts.md).

## Operational script families

| Script family | Key files | Purpose |
|---------------|-----------|---------|
| Install/bootstrap | `install.sh`, `install-panel.sh`, `install-daemon.sh`, `db-migrate.sh` | Fresh panel/node install, migration bootstrap |
| Runtime and watchdog | `start.sh`, `monitor.sh`, `backup-panel-db.sh`, `install-panel-backup-cron.sh` | Start, health supervision, panel DB backups |
| Release/build | `build-out.sh`, `esbuild-release.mjs`, `package-release.sh`, download-bundle packaging, `lib-stage-release.sh` | Build staging, minified bundles, release and download packaging |
| Prod web / edge | `prod-web.mjs`, `prod-web/*.mjs`, `prod-web-download.mjs` | Static serving, reverse proxy, TLS, `/download` integration |
| Hardening / host ops | `install-host-hardening.sh`, `install-daemon-le-cert.sh`, `install-download-le-cert.sh`, `logrotate-guartrix.conf` | Firewall cleanup, LE cert hooks, log rotation |
| Docs maintenance | `check-openapi-coverage.mjs`, `generate-openapi-stubs.mjs`, `capture-wiki-screenshots.mjs`, `fa-subset-icons.mjs` | OpenAPI and docs assets maintenance |

See [Build and release internals](build-and-release-internals.md) and [Prod-web and downloads](prod-web-and-downloads.md).

## Data model domains

`apps/api/prisma/schema.prisma` is the best quick index for persisted product capabilities:

| Model group | Examples |
|-------------|----------|
| Accounts and access | `User`, `SubUser`, `ApiKey`, `AppPassword`, `PasswordResetToken`, `EmailVerificationToken`, `PushSubscription` |
| Hosting and nodes | `Node`, `Server`, `Allocation`, `ScheduledTask`, `Database`, `PlayerModerationEvent` |
| Audit and observability | `ActivityEvent` |
| Billing | `PlanTemplate`, `Payment`, `BillingSubscription` |

## Related

- [Architecture](architecture.md)
- [Development](development.md)
- [Daemon API](daemon-api.md)
- [Node-agent internals](node-agent-internals.md)
- [Shared contracts](shared-contracts.md)
