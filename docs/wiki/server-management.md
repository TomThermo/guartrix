# Server management

This page collects the server lifecycle features that are spread across the dashboard, create flow, server header actions, and multiple tabs inside `ServerDetailPage`.

## What the server surface includes

Guartrix server management covers:

- create, import, clone, reinstall, transfer, and delete
- power control and console commands
- runtime settings and quota changes
- world, version, and software-family changes
- subusers, backups, databases, files, network allocations, activity, and schedules

The main UI entrypoints are:

- Dashboard
- Create server
- Server detail header actions
- Server detail tabs

## Create and import

`CreateServerPage` supports two modes:

1. **Create**
   Choose name, server software family, Minecraft version, memory, disk, and port. Admins can also choose the node.
2. **Import archive**
   Create a server from an uploaded `.zip` or `.tar.gz` archive.

World preset, seed, difficulty, gamemode, and initial server properties are part of the provisioning surface. The API work is mostly handled by `routes/servers-crud.ts` and `servers/server-provision.ts`.

### Java Edition

Vanilla, Paper, Purpur, Fabric, Quilt, Forge, and NeoForge — downloaded from upstream APIs (Mojang, PaperMC, Fabric/Quilt meta, Forge/NeoForged Maven). Primary game port is **TCP**.

### Bedrock Edition

The create flow also supports native Bedrock servers (grouped separately in the UI):

| Type | Description | Versions |
|------|-------------|----------|
| **Bedrock (official)** | Mojang Bedrock Dedicated Server (stable) | Listed from the [Endstone BDS registry](https://github.com/EndstoneMC/bedrock-server-data) (official Mojang Linux zips) |
| **Bedrock Preview** | Mojang BDS preview builds | Preview channel from the same registry |
| **PocketMine-MP** | Custom PHP Bedrock server | PocketMine-MP release tags from GitHub |
| **Nukkit** | Custom Java Bedrock-protocol server | Rolling `latest` snapshot from OpenCollab Maven |

Bedrock servers use **UDP** as the primary allocation (firewall + Docker publish). Docker images: `ubuntu:22.04` for BDS, `pmmp/pocketmine-mp` for PocketMine, Temurin JRE for Nukkit.

Official BDS defaults to **`online-mode=true`** (Xbox / Microsoft account verification). The daemon applies `enable-lan-visibility=true` and `transport=raknet` on each start. **Allowlist requires online mode** — with `online-mode=false` the daemon turns `allow-list` off on start. If `allow-list=true` but the allowlist file is empty, the daemon disables the allowlist on start so players can join (turn it back on after adding Xbox gamertags). The panel Whitelist tab uses **`allowlist.json`** (array format) and Xbox gamertags — not Mojang Java names. Operators use **`permissions.json`** (XUID); a player must join once before OP can be assigned offline. If boot logs show *Could not connect to Minecraft services*, the node could not reach Microsoft over HTTPS (the panel builds a `guartrix/bedrock-runtime` image with CA certificates for this; first build can take ~1–2 minutes with a console message). While starting, *Waiting for Minecraft services…* is normal for up to ~60 seconds in online mode.

**Geyser** (Paper/Purpur plugin that lets Bedrock clients join a *Java* server) remains under **Network → Bedrock (Geyser)** — that is separate from native Bedrock server types.

## Dashboard actions

The dashboard is not just a list. It exposes operational shortcuts:

- start, stop, restart, kill
- filters by node, type, and state
- deep links into a specific server tab
- quick chips for whitelist state, updates, and online players

Route anchors:

- `apps/api/src/routes/servers-dashboard.ts`
- `apps/api/src/routes/servers-power.ts`

## Server detail tabs

The server detail page is the main workspace. Tabs are grouped roughly as:

### Service and data

- Console — use **Open window** to pop the live console into a separate browser window (power controls included)
- File Manager
- SFTP
- Databases
- Network
- Backups
- Subusers

### Game/runtime

- Server Properties
- World Map
- Engine
- Plugin Management / Addons
- Modpacks
- Whitelist
- Online Players
- Bans

### Management and observability

- Schedules
- Activity Log
- Log Files
- Resources
- Bots (admin-only)

## World tools and resource packs

### World reset / upload

**Server Properties → World** (`WorldToolsCard`):

- Reset selected dimensions (overworld / nether / end)
- Upload a `.zip` world archive

The server must be **stopped**. Confirm prompts warn about data loss — take a backup first ([Files and backups](files-and-backups.md)).

### Resource pack

**Server Properties → Access / Network**:

- Require resource pack, prompt message, pack URL, SHA-1
- Optional **upload** from the panel (stores pack and sets `resource-pack` + `resource-pack-sha1`)

Minecraft clients must reach the pack URL. Set `PUBLIC_BASE_URL` to a URL players can open (see [env-reference](env-reference.md)).

### World Map / BlueMap

Sidebar **World Map** — seed preview plus optional BlueMap install (TCP **8100**). Details: [Networking](networking-and-allocations.md#bluemap-live-web-map).

## Header actions

The header and toolbar expose high-impact workflows:

- **Version**
  Change Minecraft version within the current family.
- **Software**
  Move between software families such as Paper, Purpur, Fabric, Forge, Quilt, NeoForge, Bedrock BDS, PocketMine-MP, or Nukkit.
- **Clone**
  Duplicate the server and selected data.
- **Reinstall**
  Rebuild the runtime, with optional keep-world or keep-addons flows.
- **Move**
  Transfer a stopped server to another node.
- **Owner**
  Reassign ownership as admin.
- **Start / Stop / Restart / Kill**
  Immediate lifecycle controls.

These behaviors are spread across:

- `apps/api/src/routes/servers-power.ts`
- `apps/api/src/routes/servers-settings.ts`
- `apps/api/src/routes/servers-transfer.ts`
- `apps/api/src/servers/server-lifecycle.ts`
- `apps/api/src/servers/server-provision.ts`

## States and transitions

The panel and daemon coordinate a state machine around provisioning and runtime. Common visible states include:

- `OFFLINE`
- `STARTING`
- `RUNNING`
- `STOPPING`
- `ERROR`
- `TRANSFERRING`

Important behavior notes:

- Daemon restarts do not intentionally stop running containers.
- Start can be denied by quota, disk, or license checks.
- Transfer keeps the server stopped until data, allocations, and database restore finish.
- Reinstall always creates a backup first.

## Supporting pages

This page is the hub; use these focused references for deeper detail:

- [Files and backups](files-and-backups.md)
- [Networking and allocations](networking-and-allocations.md)
- [Databases](databases.md)
- [Bots](bots.md)
- [Player management](player-management.md)
- [Mods, plugins, and modpacks](mods-plugins-and-modpacks.md)
- [Install nodes](install-nodes.md)
- [Move between nodes](node-transfer.md)
- [Schedules](schedules.md)
