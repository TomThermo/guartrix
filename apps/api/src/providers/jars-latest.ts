import { fetchJson } from "./jars-http.js";
import {
  compareMcVersions,
  neoMatchesMc,
  pickQuiltLoader,
} from "./jars-versions.js";
import type {
  FabricLoaderVersions,
  ForgePromotions,
  NeoForgeVersions,
  PaperBuildV3,
  PurpurVersion,
  QuiltLoaderVersions,
} from "./jars-versions.js";

export async function getLatestPaperBuild(
  mcVersion: string,
): Promise<number | null> {
  try {
    const builds = await fetchJson<PaperBuildV3[]>(
      `https://fill.papermc.io/v3/projects/paper/versions/${mcVersion}/builds`,
    );
    const preferred =
      builds.find((b) => b.channel === "STABLE" && b.downloads["server:default"]) ??
      builds.find((b) => b.downloads["server:default"]);
    return preferred?.id ?? null;
  } catch {
    return null;
  }
}

export async function getLatestPurpurBuild(
  mcVersion: string,
): Promise<number | null> {
  try {
    const versionInfo = await fetchJson<PurpurVersion>(
      `https://api.purpurmc.org/v2/purpur/${mcVersion}`,
    );
    const build = versionInfo.builds?.latest;
    if (build == null) return null;
    const buildNum = Number.parseInt(String(build), 10);
    return Number.isNaN(buildNum) ? null : buildNum;
  } catch {
    return null;
  }
}

export async function getLatestFabricLoader(
  mcVersion: string,
): Promise<string | null> {
  try {
    const loaders = await fetchJson<FabricLoaderVersions>(
      `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`,
    );
    const stable = loaders.find((l) => l.loader.stable) ?? loaders[0];
    return stable?.loader.version ?? null;
  } catch {
    return null;
  }
}

export async function getLatestQuiltLoader(
  mcVersion: string,
): Promise<string | null> {
  try {
    const loaders = await fetchJson<QuiltLoaderVersions>(
      `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`,
    );
    return pickQuiltLoader(loaders)?.loader.version ?? null;
  } catch {
    return null;
  }
}

export async function getLatestForgeFullVersion(
  mcVersion: string,
): Promise<string | null> {
  try {
    const promo = await fetchJson<ForgePromotions>(
      "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
    );
    const forgeBuild =
      promo.promos[`${mcVersion}-recommended`] ?? promo.promos[`${mcVersion}-latest`];
    return forgeBuild ? `${mcVersion}-${forgeBuild}` : null;
  } catch {
    return null;
  }
}

export async function getLatestNeoForgeFullVersion(
  mcVersion: string,
): Promise<string | null> {
  try {
    const data = await fetchJson<NeoForgeVersions>(
      "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge",
    );
    const matching = data.versions
      .filter((v) => !/(beta|rc|snapshot|alpha)/i.test(v) && neoMatchesMc(v, mcVersion))
      .sort(compareMcVersions);
    return matching[0] ?? null;
  } catch {
    return null;
  }
}
