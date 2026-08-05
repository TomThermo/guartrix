# Networking and allocations

Guartrix models port assignment explicitly so the panel, daemon, Docker publish rules, and firewall state stay aligned.

## Allocations model

Allocations are the panel's inventory of free and assigned `IP:port` pairs on a node.

There are two practical allocation types:

- **Primary allocation**
  The main game port mirrored on the server record.
- **Extra allocations**
  Additional TCP or UDP ports for plugins, queries, voice chat, proxies, or sidecars.

Relevant code:

- `apps/api/src/routes/allocations.ts`
- `apps/api/src/servers/allocations.ts`
- `apps/api/prisma/schema.prisma` (`Allocation`)

## Admin workflow

Admins manage allocation stock on a node before users can consume ports:

1. Add a node.
2. Create free allocations or ranges on that node.
3. Create a server with one free primary port.
4. Later assign or remove extra allocations on the server.

The UI lives in the node admin surfaces and server Network tab.

## Runtime behavior

Changing allocations affects several layers:

- Prisma state in the panel database
- Docker published ports for the game container
- firewall open/close operations on the node
- optional DNS helpers such as Cloudflare-backed hostnames

Important rules:

- changing published ports needs a restart before Docker rebinds them
- the primary allocation must stay consistent with the server's main port
- extra allocations can carry protocol information
- some helper flows can attach a UDP companion on the same numeric port

## Geyser, native Bedrock, BlueMap, and proxy helpers

### Native Bedrock servers (BDS, PocketMine-MP, Nukkit)

When you create a server with type **Bedrock (official)**, **Bedrock Preview**, **PocketMine-MP**, or **Nukkit**, Guartrix provisions the matching runtime and sets the **primary allocation to UDP** on the chosen port (firewall + Docker publish).

| Type | Runtime | Version source |
|------|---------|----------------|
| Bedrock (official) | Mojang BDS stable | [Endstone BDS registry](https://github.com/EndstoneMC/bedrock-server-data) → official Mojang Linux zips |
| Bedrock Preview | Mojang BDS preview | Same registry, preview channel |
| PocketMine-MP | PHP (`pmmp/pocketmine-mp` image) | PocketMine-MP GitHub releases |
| Nukkit | Java (`server.jar` from OpenCollab) | Rolling `latest` Maven snapshot |

Players connect with `host:UDP_port`. This is **not** the same as Geyser on a Java server (below).

Details: [Server management → Bedrock Edition](server-management.md#bedrock-edition).

### Geyser / Floodgate (Bedrock clients on Java)

On **Paper / Purpur**, the **Network** tab offers **Install Geyser**:

1. Installs Geyser + Floodgate from Modrinth.
2. Creates a **UDP companion** allocation on the same numeric port as the primary TCP game port (if missing).
3. Restart the server so Docker republishes UDP.

Bedrock clients join `host:UDP_port` (same number as Java TCP). Firewall must allow that UDP port on the node.

Code: `apps/api/src/servers/geyser.ts`, Network / Allocations UI.

### BlueMap (live web map)

On **Paper / Purpur**, **World Map** (`?tab=seedmap`) can **Install BlueMap**:

1. Install the plugin (or use Recommended stacks under Plugin Management).
2. Assign an extra TCP allocation for port **8100** (or your BlueMap listen port).
3. Save the public map URL in the World Map card; restart so Docker publishes 8100.

The seed preview itself uses [mcseedmap.net](https://mcseedmap.net/); BlueMap is the in-world explored map.

### Velocity / BungeeCord helpers

**Server Properties → Access** (Paper/Purpur only) — one-click backend prep for an *external* proxy:

| Helper | Effect |
|--------|--------|
| Velocity | `online-mode=false`, modern forwarding + secret, `prevent-proxy-connections=false` |
| BungeeCord | `online-mode=false`, Bungee forwarding flag |
| Clear | Restores online-mode / clears proxy flags |

**Restart required.** Guartrix does **not** host a Velocity/Bungee process — these helpers only configure the backend Minecraft server. See `apps/api/src/servers/proxy-setup.ts`.

Also on Network:

- UDP companion allocation for query / Geyser-style traffic
- daemon / SFTP hostname hints for the node

Some of this logic is split across:

- `apps/api/src/servers/geyser.ts`
- `apps/api/src/servers/proxy-setup.ts`
- `apps/api/src/nodes/cloudflare-dns.ts`
- `apps/api/src/nodes/firewall.ts`

## Node URLs and daemon reachability

A node has both identity and connectivity fields:

- daemon scheme/host/port used by the panel
- optional location label
- optional SFTP hostname or public host hints

Those settings drive:

- panel-to-daemon API traffic
- remote install commands shown to operators
- health checks and status cards

See [Install nodes](install-nodes.md) and [Daemon API](daemon-api.md).

## Docker networking

Port allocation is separate from container network topology:

- `DOCKER_NETWORK_MODE=per_server` (default)
  Each server gets its own game bridge while still attaching to shared services when needed, such as node-local MySQL.
- `DOCKER_NETWORK_MODE=shared`
  All game containers share one bridge (single-tenant / simplest setup).

This matters for multi-tenant isolation and is documented further in:

- [Install nodes](install-nodes.md)
- [Security](security.md)
- [Node-agent internals](node-agent-internals.md)

## Related

- [Server management](server-management.md)
- [Install nodes](install-nodes.md)
- [Move between nodes](node-transfer.md)
- [Node-agent internals](node-agent-internals.md)
- [Databases](databases.md)
- [Panel guide](panel-guide.md)
