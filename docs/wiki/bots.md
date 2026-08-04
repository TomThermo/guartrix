# Bots (Mineflayer)

Admin-only in-game bots attach to a Minecraft server from the panel (**Server → Bots**). They use [Mineflayer](https://github.com/PrismarineJS/mineflayer) inside the API process (or a forked worker).

## Who can use them

- Tab is **admin-only** (`adminOnly` in the server UI). Non-admins never see it.
- Not gated by license feature flags — any admin on a licensed or free-tier panel can open the tab.

## Requirements

| Requirement | Why |
|-------------|-----|
| Server **RUNNING** | Bots join over the game protocol |
| `online-mode=false` | Offline-mode accounts; spawn is disabled while online-mode is on |
| Compatible protocol | ViaVersion / ViaBackwards / ViaRewind (Via*) recommended when the server MC version is not natively supported; the UI notes bots speak as **1.21.x** through Via* |

Set online-mode / proxy helpers under **Server Properties → Access** (see [Networking](networking-and-allocations.md#velocity--bungeecord-helpers)). Restart after changing online-mode.

## Worker mode

By default bots run in a **forked API child** so physics/pathfinding do not block Fastify:

```bash
# .env — default is on
BOT_WORKER=1
# Emergency only: run bots in-process
# BOT_WORKER=0
```

See [Environment variables](env-reference.md) and [Architecture](architecture.md).

## Commands (UI)

Orders available from the Bots panel include:

- **ai** — free-text instruction
- **follow** / **guard** / **wander** / **goto**
- **chop** / **collect** / **dig**
- **attack** / **jump** / **look** / **say**
- **stop** / **quit**

Spawn limits and concurrent bot counts are enforced by the API (`apps/api/src/bots/`).

## Screenshots

![Bots](assets/38-server-bots.png)

## Related

- [Panel guide](panel-guide.md#bots-admin)
- [Server management](server-management.md)
- [Security](security.md) — keep online-mode=false only when you understand the trust model
