import { processManager } from "./process-manager.js";
import { readServerProperties } from "./properties.js";
import {
  buildExternalSeedMapUrl,
  buildSeedMapUrl,
  mcseedmapVersion,
  seedMapPlatform,
} from "@msm/shared";

export type WorldSeedSource = "console" | "properties" | "none";

export interface WorldSeedInfo {
  seed: string | null;
  source: WorldSeedSource;
  propertiesSeed: string | null;
  consoleAvailable: boolean;
  mapUrl: string | null;
  /** Full Chunkbase app (new tab) — same seed/platform. */
  externalMapUrl: string | null;
  mcVersion: string;
}

/** Parse Minecraft `/seed` console output → numeric seed string. */
export function parseSeedConsoleLine(line: string): string | null {
  const bracket = line.match(/Seed:\s*\[(-?\d+)\]/i);
  if (bracket?.[1]) return bracket[1];
  const plain = line.match(/\bSeed:\s*(-?\d+)\b/i);
  if (plain?.[1]) return plain[1];
  return null;
}

export {
  mcseedmapVersion,
  seedMapPlatform,
  buildSeedMapUrl,
  buildExternalSeedMapUrl,
};

function normalizePropertiesSeed(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  return s.length ? s : null;
}

export async function getWorldSeedInfo(opts: {
  serverId: string;
  mcVersion: string;
  queryConsole?: boolean;
}): Promise<WorldSeedInfo> {
  const props = await readServerProperties(opts.serverId);
  const propertiesSeed = normalizePropertiesSeed(props["level-seed"]);
  const consoleAvailable =
    processManager.isRunning(opts.serverId) &&
    processManager.getStatus(opts.serverId) === "RUNNING";

  let seed: string | null = null;
  let source: WorldSeedSource = "none";

  if (opts.queryConsole && consoleAvailable) {
    try {
      const line = await processManager.waitForOutput(
        opts.serverId,
        (l) => parseSeedConsoleLine(l) != null,
        { timeoutMs: 12_000, command: "seed" },
      );
      seed = parseSeedConsoleLine(line);
      if (seed) source = "console";
    } catch {
      // fall through to properties
    }
  }

  if (!seed && propertiesSeed) {
    seed = propertiesSeed;
    source = "properties";
  }

  return {
    seed,
    source,
    propertiesSeed,
    consoleAvailable,
    mapUrl: seed ? buildSeedMapUrl(seed, opts.mcVersion) : null,
    externalMapUrl: seed ? buildExternalSeedMapUrl(seed, opts.mcVersion) : null,
    mcVersion: opts.mcVersion,
  };
}
