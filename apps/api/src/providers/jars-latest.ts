import { fetchJson, fetchText } from "./jars-http.js";
import { compareMcVersions, neoMatchesMc, pickQuiltLoader } from "./jars-versions.js";
import type {
  FabricLoaderVersions,
  ForgePromotions,
  NeoForgeVersions,
  PaperBuildV3,
  PurpurVersion,
  QuiltLoaderVersions,
  SoftwareBuildInfo,
} from "./jars-versions.js";

export async function listPaperBuilds(mcVersion: string): Promise<SoftwareBuildInfo[]> {
  const builds = await fetchJson<PaperBuildV3[]>(
    `https://fill.papermc.io/v3/projects/paper/versions/${mcVersion}/builds`,
  );
  return builds
    .filter((b) => b.downloads["server:default"])
    .map((b) => ({ id: b.id, channel: (b.channel || "DEFAULT").toUpperCase() }))
    .sort((a, b) => b.id - a.id);
}

export async function listPurpurBuilds(mcVersion: string): Promise<SoftwareBuildInfo[]> {
  const versionInfo = await fetchJson<PurpurVersion>(
    `https://api.purpurmc.org/v2/purpur/${mcVersion}`,
  );
  const latest = versionInfo.builds?.latest;
  const all = versionInfo.builds?.all;
  const ids =
    all && all.length
      ? all
      : latest != null
        ? [String(latest)]
        : [];
  const latestNum = latest != null ? Number.parseInt(String(latest), 10) : NaN;
  return ids
    .map((raw) => Number.parseInt(String(raw), 10))
    .filter((id) => !Number.isNaN(id))
    .sort((a, b) => b - a)
    .map((id) => ({
      id,
      channel: id === latestNum ? "LATEST" : "RELEASE",
    }));
}

export async function listFabricLoaders(mcVersion: string): Promise<SoftwareBuildInfo[]> {
  const loaders = await fetchJson<FabricLoaderVersions>(
    `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`,
  );
  return loaders.map((l) => ({
    id: 0,
    version: l.loader.version,
    channel: l.loader.stable ? "STABLE" : "DEFAULT",
  }));
}

export async function listQuiltLoaders(mcVersion: string): Promise<SoftwareBuildInfo[]> {
  const loaders = await fetchJson<QuiltLoaderVersions>(
    `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`,
  );
  return loaders.map((l) => ({
    id: 0,
    version: l.loader.version,
    channel: l.loader.stable ? "STABLE" : "DEFAULT",
  }));
}

export async function listForgeVersions(mcVersion: string): Promise<SoftwareBuildInfo[]> {
  const xml = await fetchText(
    "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml",
  );
  const promo = await fetchJson<ForgePromotions>(
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
  ).catch(() => null);
  const recommended = promo?.promos[`${mcVersion}-recommended`];
  const latest = promo?.promos[`${mcVersion}-latest`];
  const prefix = `${mcVersion}-`;
  const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)]
    .map((m) => m[1]!)
    .filter((v) => v.startsWith(prefix));
  const unique = [...new Set(versions)].sort((a, b) => compareMcVersions(a, b));
  return unique.map((full) => {
    const build = full.slice(prefix.length);
    let channel = "RELEASE";
    if (recommended && build === recommended) channel = "RECOMMENDED";
    else if (latest && build === latest) channel = "LATEST";
    return { id: 0, version: full, channel };
  });
}

export async function listNeoForgeVersions(mcVersion: string): Promise<SoftwareBuildInfo[]> {
  const data = await fetchJson<NeoForgeVersions>(
    "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge",
  );
  const matching = data.versions
    .filter((v) => !/(beta|rc|snapshot|alpha)/i.test(v) && neoMatchesMc(v, mcVersion))
    .sort(compareMcVersions);
  return matching.map((version, idx) => ({
    id: 0,
    version,
    channel: idx === 0 ? "LATEST" : "RELEASE",
  }));
}

export async function listChannelBuilds(
  type: "PAPER" | "PURPUR" | "FABRIC" | "QUILT" | "FORGE" | "NEOFORGE",
  mcVersion: string,
): Promise<SoftwareBuildInfo[]> {
  switch (type) {
    case "PAPER":
      return listPaperBuilds(mcVersion);
    case "PURPUR":
      return listPurpurBuilds(mcVersion);
    case "FABRIC":
      return listFabricLoaders(mcVersion);
    case "QUILT":
      return listQuiltLoaders(mcVersion);
    case "FORGE":
      return listForgeVersions(mcVersion);
    case "NEOFORGE":
      return listNeoForgeVersions(mcVersion);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unsupported channel type: ${_exhaustive}`);
    }
  }
}

export async function getLatestPaperBuild(mcVersion: string): Promise<number | null> {
  try {
    const builds = await listPaperBuilds(mcVersion);
    const preferred = builds.find((b) => b.channel === "STABLE") ?? builds[0];
    return preferred?.id ?? null;
  } catch {
    return null;
  }
}

export async function getLatestPurpurBuild(mcVersion: string): Promise<number | null> {
  try {
    const builds = await listPurpurBuilds(mcVersion);
    return builds[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function getLatestFabricLoader(mcVersion: string): Promise<string | null> {
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

export async function getLatestQuiltLoader(mcVersion: string): Promise<string | null> {
  try {
    const loaders = await fetchJson<QuiltLoaderVersions>(
      `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`,
    );
    return pickQuiltLoader(loaders)?.loader.version ?? null;
  } catch {
    return null;
  }
}

export async function getLatestForgeFullVersion(mcVersion: string): Promise<string | null> {
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

export async function getLatestNeoForgeFullVersion(mcVersion: string): Promise<string | null> {
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
