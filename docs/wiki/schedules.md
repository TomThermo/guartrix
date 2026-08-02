# Schedules (chains)

Timed **chains** of steps on a Minecraft server: backup, wait, restart, and
console commands. Metadata lives on the panel as
`guartrix-scheduled-tasks.json` under the server data dir (hidden from the File
Manager). The API tick runs due schedules about once a minute.

## UI

Server → **Schedules**. Build ordered steps, set daily / weekly / interval timing,
enable / disable, **Run now**.

Simple backup-only cadence still lives under **Backups → Automatic schedule**.
Prefer a Schedules chain when you need “backup → wait → restart → say …”.

## Timing

| Mode | Fields |
|------|--------|
| **daily** | `dailyAt` (`HH:mm`, panel host timezone) |
| **weekly** | `dailyAt` + `weekdays` (`0`=Sun … `6`=Sat) |
| **interval** | `intervalHours` (1–168) |

## Steps

| Kind | Behaviour |
|------|-----------|
| **backup** | Creates a panel backup (daemon export; works on remote nodes). Does not advance the Backups-tab schedule. |
| **wait** | Sleep 1–3600 seconds |
| **restart** | Stop then start (optional: only if online) |
| **command** | Send console command without leading `/` (optional: only if online) |

Per step: **Continue on failure** keeps the chain going after an error.

Legacy single-step tasks (command / restart only) still load; they are normalized
into a one-step chain.

## API

```http
GET    /api/servers/:id/tasks
POST   /api/servers/:id/tasks
PATCH  /api/servers/:id/tasks/:taskId
POST   /api/servers/:id/tasks/:taskId/run
DELETE /api/servers/:id/tasks/:taskId
```

Permissions: `schedule.read` / `create` / `update` / `delete`.

Example body:

```json
{
  "mode": "weekly",
  "dailyAt": "04:00",
  "weekdays": [1, 2, 3, 4, 5],
  "note": "Weeknights",
  "steps": [
    { "kind": "backup" },
    { "kind": "wait", "delaySeconds": 30 },
    { "kind": "restart", "onlyIfRunning": true },
    { "kind": "command", "command": "say Restart complete" }
  ]
}
```

Activity: `schedule.create` / `update` / `delete` / `run`.

## Notes

- Times use the **panel host** timezone.
- Command / restart steps that are “only if online” are skipped when the server
  is stopped (the chain continues).
- A long wait blocks that server’s schedule runner until it finishes — keep waits
  short.
