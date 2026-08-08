# Node-agent internals

`packages/node-agent` is the host runtime library behind the daemon. It contains the code that actually touches Docker, files, MySQL, firewall state, SFTP, quotas, and player history.

## Main subsystems

### Runtime layout and config

Key files:

- `config.ts`
- `index.ts`

This layer resolves data paths, defaults, runtime directories, and host-level settings such as data root, backup root, Docker mode, and default images.

Important operator consequence:

- node state lives under the daemon `DATA_DIR`
- servers, backups, MySQL data, host keys, and logs are node-local assets

### Process and container lifecycle

Key files:

- `docker.ts`
- `docker-engine.ts`
- `process-manager.ts`
- `process-console.ts`
- `process-attach.ts`
- `process-start.ts`
- `process-lifecycle.ts`
- `process-types.ts`

This subsystem handles:

- creating and removing containers
- validating startup commands
- attaching to console output
- status transitions
- auto-restart behavior
- reattaching after daemon restarts

The panel experience around start/stop/restart depends heavily on this layer.

### Resource and quota enforcement

Key files:

- `resource-monitor.ts`
- `stats.ts`
- `stats-history.ts` (~1h in-memory ring; lost on daemon restart)
- `disk-usage.ts`
- `disk-quota.ts`
- `host-resources.ts`

This layer is responsible for:

- Docker stats sampling
- ~1h stats history ring for console charts (`GET /servers/:id/stats/history`)
- CPU, memory, network, and disk reporting
- over-quota checks before writes or starts
- stopping servers that exceed allowed disk limits

Configured limits and observed usage are related but different; operators should document both.

### Files, jail, and archive safety

Key files:

- `files.ts` (façade)
- `files-crud.ts`
- `files-archive.ts`
- `safe-archive.ts`
- `sftp-jail.ts`
- `sftp-handlers.ts`

This subsystem enforces:

- server-root path jail
- symlink rejection / no-follow behavior
- safe archive extraction
- blocked internal control files
- streamed file operations where possible

This is the core reason the web file manager and SFTP can coexist safely without giving direct shell access.

### SFTP service

Key files:

- `sftp-server.ts`
- `sftp-handlers.ts`

This embedded `ssh2` server:

- accepts per-server SFTP logins
- consults the panel for auth/capabilities
- maps users into jailed server paths
- enforces read/write capability restrictions

### MySQL helper

Key files:

- `mysql.ts` (façade)
- `mysql-network.ts`
- `mysql-container.ts`
- `mysql-crud.ts`

The node-agent manages the node-local `guartrix-mysql` lifecycle and related database operations for game servers.

Documented concerns:

- root bootstrap
- per-server database/user creation (**`remote: %` rejected** — private patterns only, default `172.%`)
- client auth via temporary `--defaults-extra-file` (root password not passed on argv)
- dump/restore paths
- connectivity model for game containers

### Firewall and host integration

Key file:

- `firewall.ts`

This layer automates UFW open/close rules for allocations and SFTP. It is operationally sensitive because panel state and actual host exposure can diverge if firewall actions fail or are disabled.

### Player history

Key file:

- `player-history.ts`

This layer records recent player join/leave information based on server observation. It is useful for UI history and audit context, but should not be treated as an authoritative identity platform.

### Default assets and helpers

Other notable modules:

- `default-icon.ts`
- `disk-usage.ts`
- helper files under the same package

These support panel-visible features even when they are not major standalone workflows.

## Related

- [Daemon API](daemon-api.md)
- [Files and backups](files-and-backups.md)
- [Networking and allocations](networking-and-allocations.md)
- [Security](security.md)
