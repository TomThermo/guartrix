import type { ServerType } from "@msm/shared";
import { fetchJson } from "./jars-http.js";

export interface MojangManifest {
  versions: { id: string; type: string; url: string }[];
}

export interface PaperProjectV3 {
  project: { id: string; name: string };
  versions: Record<string, string[]>;
}

export interface PaperBuildV3 {
  id: number;
  channel: string;
  downloads: {
    "server:default"?: { name: string; url: string };
  };
}

export interface PurpurProject {
  versions: string[];
}

export interface PurpurVersion {
  builds: { latest: string };
}

export interface NeoForgeVersions {
  versions: string[];
}

export type FabricGameVersions = { version: string; stable: boolean }[];

export type FabricLoaderVersions = {
  loader: { version: string; stable: boolean };
}[];

export type QuiltGameVersions = { version: string; stable: boolean }[];

export type QuiltLoaderVersions = {
  loader: { version: string; stable?: boolean };
}[];

export interface ForgePromotions {
  promos: Record<string, string>;
}

export function compareMcVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return db - da;
  }
  return 0;
}

/** Ascending compare: negative if a < b, 0 if equal, positive if a > b */
export function compareVersionsAsc(a: string, b: string): number {
  return -compareMcVersions(a, b);
}

export function pickQuiltLoader(
  loaders: QuiltLoaderVersions,
): QuiltLoaderVersions[number] | undefined {
  if (!loaders.length) return undefined;
  const markedStable = loaders.find((l) => l.loader.stable);
  if (markedStable) return markedStable;
  const release = loaders
    .filter((l) => !/(beta|alpha|rc|snapshot)/i.test(l.loader.version))
    .sort((a, b) => compareMcVersions(a.loader.version, b.loader.version));
  return release[0] ?? loaders[0];
}

/** NeoForge "21.1.77" → MC "1.21.1"; minor 0 → "1.21" (and optionally "1.21.0"). */
export function neoVersionToMcCandidates(neoVer: string): string[] {
  const parts = neoVer.split(".");
  const major = parts[0];
  if (!major || Number.isNaN(Number.parseInt(major, 10))) return [];
  const minor = Number.parseInt(parts[1] ?? "0", 10) || 0;
  if (minor === 0) return [`1.${major}`, `1.${major}.0`];
  return [`1.${major}.${minor}`];
}

export function neoPrimaryMcVersion(neoVer: string): string | null {
  const candidates = neoVersionToMcCandidates(neoVer);
  return candidates[0] ?? null;
}

export function neoMatchesMc(neoVer: string, mcVersion: string): boolean {
  return neoVersionToMcCandidates(neoVer).includes(mcVersion);
}

export async function listVersions(type: ServerType): Promise<string[]> {
  if (type === "VANILLA") {
    const manifest = await fetchJson<MojangManifest>(
      "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
    );
    return manifest.versions.filter((v) => v.type === "release").map((v) => v.id);
  }

  if (type === "PAPER") {
    const project = await fetchJson<PaperProjectV3>("https://fill.papermc.io/v3/projects/paper");
    const all = Object.values(project.versions).flat();
    const stableLooking = all.filter((v) => !/(rc|pre|snapshot)/i.test(v));
    return stableLooking.length ? stableLooking : all;
  }

  if (type === "PURPUR") {
    const project = await fetchJson<PurpurProject>("https://api.purpurmc.org/v2/purpur");
    return [...project.versions].sort(compareMcVersions);
  }

  if (type === "FORGE") {
    const promo = await fetchJson<ForgePromotions>(
      "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
    );
    const versions = new Set<string>();
    for (const key of Object.keys(promo.promos)) {
      const mc = key.replace(/-(recommended|latest)$/i, "");
      // Keep modern Forge only (1.16+ uses installer / run.sh layout we support)
      const majorMinor = mc.split(".").map((p) => Number.parseInt(p, 10) || 0);
      if ((majorMinor[0] ?? 0) > 1 || ((majorMinor[0] ?? 0) === 1 && (majorMinor[1] ?? 0) >= 16)) {
        versions.add(mc);
      }
    }
    return [...versions].sort(compareMcVersions);
  }

  if (type === "NEOFORGE") {
    const data = await fetchJson<NeoForgeVersions>(
      "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge",
    );
    const versions = new Set<string>();
    for (const neoVer of data.versions) {
      // Skip beta/rc-style neo versions if any slip in
      if (/(beta|rc|snapshot|alpha)/i.test(neoVer)) continue;
      const mc = neoPrimaryMcVersion(neoVer);
      if (mc) versions.add(mc);
    }
    return [...versions].sort(compareMcVersions);
  }

  if (type === "QUILT") {
    const games = await fetchJson<QuiltGameVersions>("https://meta.quiltmc.org/v3/versions/game");
    return games.filter((g) => g.stable).map((g) => g.version);
  }

  if (type === "BEDROCK") {
    const { listBedrockStableVersions } = await import("./bedrock.js");
    return listBedrockStableVersions();
  }

  if (type === "BEDROCK_PREVIEW") {
    const { listBedrockPreviewVersions } = await import("./bedrock.js");
    return listBedrockPreviewVersions();
  }

  if (type === "POCKETMINE") {
    const { listPocketMineVersions } = await import("./bedrock.js");
    return listPocketMineVersions();
  }

  if (type === "NUKKIT") {
    const { listNukkitVersions } = await import("./bedrock.js");
    return listNukkitVersions();
  }

  const games = await fetchJson<FabricGameVersions>("https://meta.fabricmc.net/v2/versions/game");
  return games.filter((g) => g.stable).map((g) => g.version);
}
