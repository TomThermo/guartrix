import fs from "node:fs/promises";
import path from "node:path";
import { isBdsServerType, serializeBdsAllowlist, type ServerType } from "@msm/shared";
import { readDefaultServerIcon } from "../servers/default-icon.js";
import {
  downloadFabric,
  downloadForge,
  downloadNeoForge,
  downloadPaper,
  downloadPurpur,
  downloadQuilt,
  downloadVanilla,
} from "./jars-download.js";

export async function prepareServerFiles(
  type: ServerType,
  mcVersion: string,
  destDir: string,
  port: number,
): Promise<{
  jarName: string;
  paperBuild?: number;
  fabricLoaderVersion?: string;
  forgeVersion?: string;
}> {
  await fs.mkdir(destDir, { recursive: true });
  await fs.writeFile(path.join(destDir, "eula.txt"), "eula=true\n", "utf8");
  // Classic Minecraft pack icon until the user uploads their own
  await fs.writeFile(path.join(destDir, "server-icon.png"), readDefaultServerIcon());

  const isBds = isBdsServerType(type);
  const defaultProperties = isBds
    ? [
        `server-port=${port}`,
        "motd=A Minecraft Server",
        "max-players=20",
        "difficulty=easy",
        "gamemode=survival",
        "online-mode=true",
        "allow-list=false",
        "enable-lan-visibility=true",
        "transport=raknet",
        "level-name=world",
        "",
      ].join("\n")
    : [
        `server-port=${port}`,
        "motd=A Minecraft Server",
        "max-players=20",
        "difficulty=easy",
        "gamemode=survival",
        "online-mode=true",
        "pvp=true",
        "view-distance=10",
        "spawn-protection=16",
        "level-name=world",
        "white-list=false",
        "",
      ].join("\n");
  await fs.writeFile(path.join(destDir, "server.properties"), defaultProperties, "utf8");
  if (isBds) {
    await fs.writeFile(path.join(destDir, "allowlist.json"), serializeBdsAllowlist([]), "utf8");
    await fs.writeFile(path.join(destDir, "permissions.json"), "[]\n", "utf8");
  }

  switch (type) {
    case "VANILLA":
      return downloadVanilla(mcVersion, destDir);
    case "PAPER":
      return downloadPaper(mcVersion, destDir);
    case "PURPUR":
      return downloadPurpur(mcVersion, destDir);
    case "FABRIC":
      return downloadFabric(mcVersion, destDir);
    case "QUILT":
      return downloadQuilt(mcVersion, destDir);
    case "FORGE":
      return downloadForge(mcVersion, destDir);
    case "NEOFORGE":
      return downloadNeoForge(mcVersion, destDir);
    case "BEDROCK":
      return (await import("./bedrock.js")).downloadBedrock(mcVersion, destDir, false);
    case "BEDROCK_PREVIEW":
      return (await import("./bedrock.js")).downloadBedrock(mcVersion, destDir, true);
    case "POCKETMINE":
      return (await import("./bedrock.js")).downloadPocketMine(mcVersion, destDir);
    case "NUKKIT":
      return (await import("./bedrock.js")).downloadNukkit(mcVersion, destDir);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unsupported server type: ${_exhaustive}`);
    }
  }
}

/**
 * Replace jar / Forge runtime for an existing server without wiping world or properties.
 */
export async function replaceServerRuntime(
  type: ServerType,
  mcVersion: string,
  destDir: string,
): Promise<{
  jarName: string;
  paperBuild?: number;
  fabricLoaderVersion?: string;
  forgeVersion?: string;
}> {
  await fs.mkdir(destDir, { recursive: true });
  // Remove previous primary jar so we don't mix runtimes
  await fs.rm(path.join(destDir, "server.jar"), { force: true }).catch(() => undefined);

  switch (type) {
    case "VANILLA":
      return downloadVanilla(mcVersion, destDir);
    case "PAPER":
      return downloadPaper(mcVersion, destDir);
    case "PURPUR":
      return downloadPurpur(mcVersion, destDir);
    case "FABRIC":
      return downloadFabric(mcVersion, destDir);
    case "QUILT":
      return downloadQuilt(mcVersion, destDir);
    case "FORGE":
      return downloadForge(mcVersion, destDir);
    case "NEOFORGE":
      return downloadNeoForge(mcVersion, destDir);
    case "BEDROCK":
      return (await import("./bedrock.js")).downloadBedrock(mcVersion, destDir, false);
    case "BEDROCK_PREVIEW":
      return (await import("./bedrock.js")).downloadBedrock(mcVersion, destDir, true);
    case "POCKETMINE":
      return (await import("./bedrock.js")).downloadPocketMine(mcVersion, destDir);
    case "NUKKIT":
      return (await import("./bedrock.js")).downloadNukkit(mcVersion, destDir);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unsupported server type: ${_exhaustive}`);
    }
  }
}

/**
 * Backups exclude libraries/ — after restore Fabric/Quilt cannot find
 * FabricServerLauncher until the loader jars are present again.
 */
export async function ensureModLoaderRuntime(opts: {
  type: "FABRIC" | "QUILT";
  mcVersion: string;
  destDir: string;
}): Promise<void> {
  const loaderRoot =
    opts.type === "FABRIC"
      ? path.join(opts.destDir, "libraries", "net", "fabricmc", "fabric-loader")
      : path.join(opts.destDir, "libraries", "org", "quiltmc", "quilt-loader");

  let hasLoader = false;
  try {
    const versions = await fs.readdir(loaderRoot);
    for (const ver of versions) {
      const entries = await fs.readdir(path.join(loaderRoot, ver));
      if (entries.some((n) => n.endsWith(".jar"))) {
        hasLoader = true;
        break;
      }
    }
  } catch {
    hasLoader = false;
  }
  if (hasLoader) return;

  if (opts.type === "FABRIC") {
    await downloadFabric(opts.mcVersion, opts.destDir);
  } else {
    await downloadQuilt(opts.mcVersion, opts.destDir);
  }
}
