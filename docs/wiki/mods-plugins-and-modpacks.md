# Mods, plugins, and modpacks

Guartrix supports multiple server software families and exposes add-on tooling conditionally based on compatibility.

## Supported families

The main runtime families include:

- Vanilla
- Paper
- Purpur
- Fabric
- Quilt
- Forge
- NeoForge

The exact UI and helper panels change with the selected family.

## Addons

Addon management is driven by:

- `apps/api/src/routes/servers-addons.ts`
- `apps/api/src/servers/addons.ts`
- `apps/api/src/servers/addons-install.ts`
- `apps/api/src/servers/addons-modrinth.ts`
- `apps/api/src/servers/addons-sync.ts`

What the panel can do:

- browse supported content sources
- install supported plugins or mods
- check for updates
- remove or update installed entries
- surface recommended helpers such as Geyser/Floodgate in compatible cases

## Modpacks

Modpack flows are handled by `apps/api/src/servers/modpacks.ts` and the `ModpackPanel` in the web UI.

Typical behavior:

- choose a compatible modpack source/version
- install or replace the server payload
- align the server software/runtime family with that pack

Operators should expect that large modpack changes are closer to reprovisioning than to adding one plugin.

## Engine settings

Paper/Purpur-style stacks expose extra engine tuning in the server Engine panel. This is where feature-specific controls and helpers live beyond raw `server.properties`.

Relevant anchor:

- `apps/api/src/servers/engine-config.ts`

## Resource packs and world helpers

Adjacent content-management features include:

- resource-pack settings via `routes/resource-pack.ts`
- world seed/map helpers via `servers/world-seed.ts` and shared seed URL helpers
- proxy/gameplay convenience toggles such as Geyser for cross-platform access

## Cross-family changes

Switching software family is a high-impact action:

- plugin ecosystems and mod ecosystems are not interchangeable
- addons may need to be removed or re-synced
- startup commands, Java versions, and jar expectations can change

That is why software-family change, version update, reinstall, and addon management are documented together conceptually.

## Related

- [Server management](server-management.md)
- [Networking and allocations](networking-and-allocations.md)
- [Panel guide](panel-guide.md)
