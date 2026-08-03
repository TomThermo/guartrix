import { processManager } from "./process-manager.js";
import { readServerProperties } from "./properties.js";

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

/**
 * Map panel MC version → mcseedmap.net path segment (`1.21.4-Java`).
 * @see https://mcseedmap.net/
 */
export function mcseedmapVersion(mcVersion: string): string {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mcVersion.trim());
  if (!m) return "1.21.4-Java";
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = m[3] != null ? Number(m[3]) : 0;
  return `${major}.${minor}.${patch}-Java`;
}

/**
 * Map panel MC version → Chunkbase `platform` token.
 * @see https://www.chunkbase.com/apps/seed-map
 */
export function seedMapPlatform(mcVersion: string): string {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mcVersion.trim());
  if (!m) return "java_1_21";
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = m[3] != null ? Number(m[3]) : 0;

  if (major >= 26) {
    if (minor >= 3) return "java_26_3";
    if (minor >= 2) return "java_26_2";
    return "java_26_1";
  }
  if (major >= 25) return "java_26_1";

  if (major === 1 && minor === 21) {
    if (patch >= 9) return "java_1_21_9";
    if (patch >= 6) return "java_1_21_6";
    if (patch === 5) return "java_1_21_5";
    if (patch === 4) return "java_1_21_4";
    if (patch >= 2) return "java_1_21_2";
    return "java_1_21";
  }
  if (major === 1 && minor === 20) return "java_1_20";
  if (major === 1 && minor === 19) {
    return patch >= 3 ? "java_1_19_3" : "java_1_19";
  }
  if (major === 1 && minor >= 7 && minor <= 18) return `java_1_${minor}`;
  return "java_1_21";
}

/** In-panel iframe target (mcseedmap.net allows framing). */
export function buildSeedMapUrl(seed: string, mcVersion: string): string {
  const version = encodeURIComponent(mcseedmapVersion(mcVersion));
  const seedSeg = encodeURIComponent(seed);
  return `https://mcseedmap.net/${version}/${seedSeg}`;
}

/** Full Chunkbase UI for “open in new tab”. */
export function buildExternalSeedMapUrl(seed: string, mcVersion: string): string {
  const platform = seedMapPlatform(mcVersion);
  const hash = [
    `seed=${encodeURIComponent(seed)}`,
    `platform=${encodeURIComponent(platform)}`,
    "dimension=overworld",
    "x=0",
    "z=0",
    "zoom=0.5",
    "showBiomes=true",
    "terrain=true",
  ].join("&");
  return `https://www.chunkbase.com/apps/seed-map#${hash}`;
}

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
