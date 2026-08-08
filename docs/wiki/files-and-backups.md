# Files and backups

Guartrix has three related data-management surfaces:

- the in-panel file manager
- SFTP access
- server backup and restore workflows

These surfaces share the same server data directory but differ in transport, limits, and intended use.

## File manager

The panel file manager uses `apps/api/src/routes/files.ts` on the panel side and `apps/daemon/src/routes/files.ts` plus `packages/node-agent/src/files.ts` on the node side.

Main capabilities:

- browse with a folder tree and filtered file list
- open multiple text files in Monaco editor tabs (syntax highlighting)
- create files and folders; rename and delete
- upload (multi-file and drag-and-drop) and download files
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
- tar extract uses portable flags only (works on BusyBox and GNU tar; paths pre-validated)
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
- **retention limit per server** — how many backups to keep (default **7**, max **50**); set when **creating a server**, or centrally in **Admin → Servers** (edit modal); older archives are pruned automatically after each new backup (manual, scheduled, or upload). The Backups tab shows the current limit read-only.
- panel default for new servers: **Admin → Settings → Backup** (`defaultBackupKeepCount`) or env `DEFAULT_BACKUP_KEEP_COUNT`
- schedule recurring backups (daily, weekly, interval, or **cron** five-field expression) stored as MySQL **`BackupSchedule`** rows (batched by `SCHEDULER_BACKUP_BATCH`)
- optional **offsite hook** after each backup (`BACKUP_OFFSITE_CMD` or **Admin → Settings → Backup**)
- **MySQL dumps** for databases linked to the server are embedded under `guartrix-mysql/` in the archive and restored with the backup

Distinct from [Schedules](schedules.md) step chains (backup → wait → restart → command).

### Backup behavior

- Restores can optionally auto-start after completion.
- Reinstall/transfer safety flows can create backups before destructive actions.
- Encrypted backup mode can be enabled by environment configuration.
- Transfer and restore flows stream data rather than fully unpacking everything on the panel host.

Internal helpers (domain peels behind `backups.ts`):

- `apps/api/src/servers/backup-transfer.ts`
- `apps/api/src/servers/backup-crypto.ts`
- `apps/api/src/servers/backup-mysql.ts` — embed/restore linked game MySQL dumps
- `apps/api/src/servers/backup-offsite.ts` — post-backup `BACKUP_OFFSITE_CMD` hook
- `apps/api/src/servers/backup-paths.ts` — archive path helpers
- `apps/api/src/servers/backup-schedule.ts` — recurring backup schedule helpers

Web file manager UI peels: `FileManager.tsx` + `file-manager/` panes (toolbar, browser table, editor, tree).

## Restore expectations

Operators should document or remember:

- restores overwrite server data for the selected target
- restart may be required to republish allocations or fully apply changed runtime files
- file backups now include linked game **MySQL** dumps when present; panel Prisma DB is separate (see [Operations](operations.md))

## Related

- [SFTP](sftp.md)
- [Schedules](schedules.md)
- [Operations](operations.md)
- [Node-agent internals](node-agent-internals.md)
