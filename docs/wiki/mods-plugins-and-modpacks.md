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

- browse supported content sources (Modrinth; optional **CurseForge** when `CURSEFORGE_API_KEY` is set)
- install supported plugins or mods
- check for updates
- remove or update installed entries
- recommended stacks (Essentials, moderation, BlueMap, …) on Paper/Purpur
- surface recommended helpers such as Geyser/Floodgate in compatible cases

Set `CURSEFORGE_API_KEY` in `.env` for CurseForge modpack search (see [env-reference](env-reference.md)).

## Modpacks

Modpack flows are handled by `apps/api/src/servers/modpacks.ts` and the `ModpackPanel` in the web UI.

Typical behavior:

- choose a compatible modpack source/version
- install or replace the server payload
- align the server software/runtime family with that pack

Large modpack changes are closer to reprovisioning a server than installing a single plugin.

## Engine settings

Paper/Purpur-style stacks expose extra engine tuning in the server Engine panel. This is where feature-specific controls and helpers live beyond raw `server.properties`.

Relevant anchor:

- `apps/api/src/servers/engine-config.ts`

## Resource packs and world helpers

Adjacent content-management features include:

- resource-pack settings + upload via `routes/resource-pack.ts` (clients need reachable `PUBLIC_BASE_URL`)
- world reset / zip upload under Server Properties → World ([server management](server-management.md#world-tools-and-resource-packs))
- world seed/map helpers via `servers/world-seed.ts` and World Map / BlueMap ([networking](networking-and-allocations.md#bluemap-live-web-map))
- proxy/gameplay convenience toggles such as Geyser and Velocity/Bungee helpers ([networking](networking-and-allocations.md#geyser-bluemap-and-proxy-helpers))

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
