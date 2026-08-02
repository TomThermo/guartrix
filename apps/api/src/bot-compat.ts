import fs from "node:fs/promises";
import path from "node:path";
import minecraftData from "minecraft-data";
import type { ServerType } from "@msm/shared";
import { installAddon, listInstalledAddons } from "./addons.js";

/** Latest Mineflayer/minecraft-data version we can speak natively. */
export function latestSupportedBotVersion(): string {
  const preferred = [
    "1.21.11",
    "1.21.10",
    "1.21.9",
    "1.21.8",
    "1.21.5",
    "1.21.4",
    "1.21.3",
    "1.21.1",
    "1.21",
  ];
  for (const v of preferred) {
    if (hasMineflayerData(v)) return v;
  }
  // Fallback: scan releases
  try {
    const versions = (minecraftData as unknown as {
      versions: { pc: { minecraftVersion: string; releaseType?: string }[] };
    }).versions.pc;
    for (const row of [...versions].reverse()) {
      if (row.releaseType === "release" && hasMineflayerData(row.minecraftVersion)) {
        return row.minecraftVersion;
      }
    }
  } catch {
    // ignore
  }
  return "1.21.4";
}

export function hasMineflayerData(version: string): boolean {
  try {
    const data = minecraftData(version);
    return Boolean(data?.protocol && data?.blocks);
  } catch {
    return false;
  }
}

/**
 * Client version Mineflayer should use.
 * For unsupported server versions (e.g. 26.2), speak an older protocol via Via*.
 */
export function resolveBotClientVersion(serverMcVersion: string): {
  clientVersion: string;
  needsVia: boolean;
} {
  if (hasMineflayerData(serverMcVersion)) {
    return { clientVersion: serverMcVersion, needsVia: false };
  }
  return { clientVersion: latestSupportedBotVersion(), needsVia: true };
}

function viaProjectsFor(type: ServerType): string[] {
  if (type === "FABRIC" || type === "QUILT") {
    return ["viafabric", "viaversion", "viabackwards"];
  }
  if (type === "PAPER" || type === "PURPUR") {
    return ["viaversion", "viabackwards"];
  }
  return [];
}

async function jarLooksLikeVia(serverDir: string, type: ServerType): Promise<boolean> {
  const sub =
    type === "FABRIC" || type === "QUILT" || type === "NEOFORGE" || type === "FORGE"
      ? "mods"
      : "plugins";
  const dir = path.join(serverDir, sub);
  try {
    const names = await fs.readdir(dir);
    const lower = names.map((n) => n.toLowerCase());
    const hasVia = lower.some((n) => n.includes("viaversion"));
    const hasBack = lower.some((n) => n.includes("viabackwards"));
    const needsFabric = type === "FABRIC" || type === "QUILT";
    const hasFabric = lower.some((n) => n.includes("viafabric"));
    return hasVia && hasBack && (!needsFabric || hasFabric);
  } catch {
    return false;
  }
}

export async function ensureViaForBots(opts: {
  serverDir: string;
  type: ServerType;
  mcVersion: string;
}): Promise<{ ready: boolean; installed: string[]; message?: string }> {
  const projects = viaProjectsFor(opts.type);
  if (projects.length === 0) {
    return {
      ready: false,
      installed: [],
      message: `Mineflayer has no protocol data for Minecraft ${opts.mcVersion}, and this server type cannot install Via* automatically. Use a 1.21.x server or install ViaVersion/ViaBackwards manually.`,
    };
  }

  const installed = await listInstalledAddons(opts.serverDir);
  const have = new Set(
    installed.flatMap((a) => [a.slug.toLowerCase(), a.projectId.toLowerCase()]),
  );
  const onDisk = await jarLooksLikeVia(opts.serverDir, opts.type);

  const missing = projects.filter(
    (slug) => !have.has(slug) && !have.has(slug.replace(/-/g, "")),
  );

  // Disk check is enough if jars are present even without manifest entries
  if (missing.length === 0 || onDisk) {
    return { ready: true, installed: [] };
  }

  const newly: string[] = [];
  for (const slug of missing) {
    // Skip if another missing install already pulled it as a dependency
    const again = await listInstalledAddons(opts.serverDir);
    if (again.some((a) => a.slug === slug || a.projectId === slug)) continue;
    await installAddon({
      serverDir: opts.serverDir,
      type: opts.type,
      mcVersion: opts.mcVersion,
      projectId: slug,
    });
    newly.push(slug);
  }

  return {
    ready: false,
    installed: newly,
    message:
      newly.length > 0
        ? `Mineflayer cannot speak ${opts.mcVersion} natively. Installed ${newly.join(", ")} so bots can join as ${latestSupportedBotVersion()}. Restart the server, then spawn bots again.`
        : `Mineflayer cannot speak ${opts.mcVersion} natively. Install ViaFabric + ViaVersion + ViaBackwards, restart, then spawn bots again.`,
  };
}
