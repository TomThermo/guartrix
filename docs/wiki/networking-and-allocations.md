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

## Geyser and proxy helpers

The Network tab is also where operator convenience features appear for networking-sensitive stacks:

- one-click Geyser/Floodgate helper flows
- UDP companion allocation for Bedrock/query style traffic
- daemon/SFTP hostname information for node access

Some of this logic is split across:

- `apps/api/src/servers/geyser.ts`
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

- `DOCKER_NETWORK_MODE=shared`
  All game containers share one bridge.
- `DOCKER_NETWORK_MODE=per_server`
  Each server gets its own game bridge while still attaching to shared services when needed, such as node-local MySQL.

This matters for multi-tenant isolation and is documented further in:

- [Install nodes](install-nodes.md)
- [Security](security.md)
- [Node-agent internals](node-agent-internals.md)

## Related

- [Server management](server-management.md)
- [Install nodes](install-nodes.md)
- [Move between nodes](node-transfer.md)
- [Node-agent internals](node-agent-internals.md)
