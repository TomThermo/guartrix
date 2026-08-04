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

- Console
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
- Bots (admin/license dependent)

## Header actions

The header and toolbar expose high-impact workflows:

- **Version**
  Change Minecraft version within the current family.
- **Software**
  Move between software families such as Paper, Purpur, Fabric, Forge, Quilt, and NeoForge.
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
- [Player management](player-management.md)
- [Mods, plugins, and modpacks](mods-plugins-and-modpacks.md)
- [Install nodes](install-nodes.md)
- [Move between nodes](node-transfer.md)
- [Schedules](schedules.md)
