# Status overview (Admin → Status)

Admins open **Admin → Status** (`/admin/status`) for a live health board of the panel stack and every game node.

![Statusline](assets/07-statusline.png)

## What you see

| Area | Contents |
|------|----------|
| Architecture strip | Web → API → Daemon → Minecraft path |
| Version | Running panel version vs license channel |
| Panel cards | Web (URL / ports / PID), API (port / uptime / memory / Node), Watchdog, Redis (if enabled) |
| Nodes | Summary plus **per-node** cards: reachability, containers, CPU/RAM, MySQL, etc. |
| System logs | Tail of operator-relevant log streams |

The page auto-refreshes on an interval (`STATUS_REFRESH_MS` in the web app).

## When to use it

- After install: confirm web, API, and local/remote daemons are healthy
- After Redis / MySQL / HTTPS changes: confirm cards match the new topology
- Before blaming a game server: check whether the **node** is offline first

Day-to-day restarts: [Operations](operations.md). Node reachability: [Install nodes](install-nodes.md) · [Daemon API](daemon-api.md).

## Related

- [Panel guide](panel-guide.md#status)
- [Operations](operations.md)
- [Scaling](scaling.md) — Redis HA
