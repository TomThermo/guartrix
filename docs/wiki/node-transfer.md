# Move server between nodes

Admins can move an existing Minecraft server to another daemon node **without
changing its id** (unlike clone). Files, primary + extra ports, firewall rules
and Cloudflare DNS are rebound to the destination.

## UI

Server detail toolbar → **Move** (admins only). Pick destination node, optional
primary port remap, optionally start after success. Progress polls until done —
the Move modal shows a **percent bar** plus payload size while exporting/deploying.

Requirements:

- Server must be **stopped**
- No backup in progress
- Destination has capacity and free ports (including extras)
- MySQL databases are moved automatically (dump → restore)

## API

```http
POST /api/servers/:id/transfer
{ "nodeId": "…", "port"?: 25566, "startAfter"?: true }
→ 202 { server, transfer }

GET /api/servers/:id/transfer
→ { server, transfer }
```

`transfer` steps: Validate → Export → Rebind network → Deploy → DNS & cleanup → Finish.

While running, `server.status` is `TRANSFERRING`. On success it becomes `STOPPED`
(or starts if `startAfter`). On failure before cutover the server stays on the
source node; after cutover it stays on the destination with `ERROR` and a message.

## What moves

| Item | Behaviour |
|------|-----------|
| World / files | Export from source daemon → deploy on destination (same as clone pipeline) |
| Allocations | All rows rebind `nodeId` (primary port remapped if requested) |
| Firewall | Closed on source, opened on destination |
| DNS subdomain | A/SRV updated to destination public IPv4 when Cloudflare is configured |
| Server id / ownership / subusers | Unchanged |
| Backups (panel) | Stay on the panel host |
| MySQL databases | Dump on source → recreate + restore on destination → drop source |

## Ops notes

Large worlds stream as a single `.tar.gz` through the panel temp dir (export →
deploy, no unpack). Keep free space on the panel for ~1× world size during the
move. Activity log records `server.transfer`.

See also [Install nodes](install-nodes.md) and [Architecture](architecture.md).
