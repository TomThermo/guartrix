# Files and backups

Guartrix has three related data-management surfaces:

- the in-panel file manager
- SFTP access
- server backup and restore workflows

These surfaces share the same server data directory but differ in transport, limits, and intended use.

## File manager

The panel file manager uses `apps/api/src/routes/files.ts` on the panel side and `apps/daemon/src/routes/files.ts` plus `packages/node-agent/src/files.ts` on the node side.

Main capabilities:

- list directories
- read and edit text files
- upload and download files
- create folders
- rename, move, copy, delete
- compress selected paths into an archive
- decompress uploaded archives
- download one path or a generated zip

### Intended use

Use the panel file manager for:

- quick edits to `server.properties`
- plugin or mod uploads
- browsing logs and configs
- one-off archive actions

Use SFTP for:

- large syncs
- drag-and-drop folders
- repeated bulk transfers from desktop tools

## Jail and safety model

All file access is jailed to the server directory on the node. Important protections:

- symlinks are rejected or not followed
- archives are validated entry by entry before extraction
- internal `guartrix-*` control files are blocked from normal user access
- upload and write paths are checked against disk quotas

Relevant internals:

- `packages/node-agent/src/sftp-jail.ts`
- `packages/node-agent/src/safe-archive.ts`
- `packages/node-agent/src/sftp-handlers.ts`

## Size and quota behavior

Behavior that matters to operators:

- large uploads are streamed rather than fully buffered
- disk usage is checked before or during writes
- over-quota servers may be prevented from starting and can be stopped while running
- file list/read operations do not recursively `chown` the entire world each time

See also [Operations](operations.md) and [Node-agent internals](node-agent-internals.md).

## SFTP

SFTP uses the same server data root but a different auth path:

- Username: `{panelUsername}.{serverId}`
- Password: panel password or an app password (`gtap_…`)
- Port: `2022`
- Protocol: SFTP only

The daemon embeds an `ssh2` server. Auth is delegated back to the panel through `routes/sftp-auth.ts`, and per-session capabilities determine whether a user can read only or also write/delete.

Use [SFTP](sftp.md) for the end-user connection guide.

## Backups

Backup flows are driven by `apps/api/src/routes/backups.ts` and the `apps/api/src/servers/backups.ts` service layer.

Main capabilities:

- create manual backups
- download backups
- upload existing backup archives
- restore to the current server
- delete old backups
- schedule recurring backups

### Backup behavior

- Restores can optionally auto-start after completion.
- Reinstall/transfer safety flows can create backups before destructive actions.
- Encrypted backup mode can be enabled by environment configuration.
- Transfer and restore flows stream data rather than fully unpacking everything on the panel host.

Internal helpers:

- `apps/api/src/servers/backup-transfer.ts`
- `apps/api/src/servers/backup-crypto.ts`

## Restore expectations

Operators should document or remember:

- restores overwrite server data for the selected target
- restart may be required to republish allocations or fully apply changed runtime files
- database data is a separate lifecycle from file backups unless the flow explicitly includes database dump/restore

## Related

- [SFTP](sftp.md)
- [Schedules](schedules.md)
- [Operations](operations.md)
- [Node-agent internals](node-agent-internals.md)
