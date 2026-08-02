# Scaling

## Supported model

**Scale out daemons (nodes). Keep one panel API.**

Example that works well: **~10 nodes**, **~100 users**, dozens of game servers — one API process, one MySQL, local `data/` on the panel host.

```
Users ──► 1× panel (web + API + MySQL)
              ├── HTTP to each daemon
              └── 1 WebSocket event bridge per node
Nodes ──► Minecraft containers + SFTP + optional MySQL
```

Bottlenecks are usually **RAM/CPU on game nodes**, not the panel.

## Do you need Redis?

**Not for multi-node.** Redis (or similar) is only relevant if you want **multiple panel API replicas** (HA / horizontal panel scale). Today the panel keeps in-process state:

- File sessions under `data/sessions`
- Per-node event WebSockets and live console fan-out
- Rate limits, backup mutex, scheduled tasks (single `setInterval`)

Two API processes without a shared store would duplicate jobs and break consoles/sessions.

## Guidance

| Goal | Approach |
|------|----------|
| More Minecraft capacity | Add nodes via System → Add node |
| More admins / light panel traffic | Bigger single panel VPS is enough |
| Panel HA / multi-API | Not implemented — would need shared sessions, leader election, event bus |

## Related

- [Architecture](architecture.md)
- [Install nodes](install-nodes.md)
