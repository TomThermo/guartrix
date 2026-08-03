import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import type { ServerType } from "@msm/shared";
import { config } from "../config.js";
import { DEFAULT_SERVER_ICON_PATH } from "../default-icon.js";

const USER_AGENT = "Guartrix/1.0 (MinecraftServerManager; contact@localhost)";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.json() as Promise<T>;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const { fetchSafeDownload } = await import("../safe-url.js");
  const res = await fetchSafeDownload(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const fileStream = createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body as never), fileStream);
}

function compareMcVersions(a: string, b: string): number {
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

export { compareMcVersions };

// --- Version listing ---

interface MojangManifest {
  versions: { id: string; type: string; url: string }[];
}

interface PaperProjectV3 {
  project: { id: string; name: string };
  versions: Record<string, string[]>;
}

interface PaperBuildV3 {
  id: number;
  channel: string;
  downloads: {
    "server:default"?: { name: string; url: string };
  };
}

interface PurpurProject {
  versions: string[];
}

interface PurpurVersion {
  builds: { latest: string };
}

interface NeoForgeVersions {
  versions: string[];
}

type FabricGameVersions = { version: string; stable: boolean }[];

type FabricLoaderVersions = {
  loader: { version: string; stable: boolean };
}[];

type QuiltGameVersions = { version: string; stable: boolean }[];

type QuiltLoaderVersions = {
  loader: { version: string; stable?: boolean };
}[];

function pickQuiltLoader(loaders: QuiltLoaderVersions): QuiltLoaderVersions[number] | undefined {
  if (!loaders.length) return undefined;
  const markedStable = loaders.find((l) => l.loader.stable);
  if (markedStable) return markedStable;
  const release = loaders
    .filter((l) => !/(beta|alpha|rc|snapshot)/i.test(l.loader.version))
    .sort((a, b) => compareMcVersions(a.loader.version, b.loader.version));
  return release[0] ?? loaders[0];
}

interface ForgePromotions {
  promos: Record<string, string>;
}

/** NeoForge "21.1.77" → MC "1.21.1"; minor 0 → "1.21" (and optionally "1.21.0"). */
function neoVersionToMcCandidates(neoVer: string): string[] {
  const parts = neoVer.split(".");
  const major = parts[0];
  if (!major || Number.isNaN(Number.parseInt(major, 10))) return [];
  const minor = Number.parseInt(parts[1] ?? "0", 10) || 0;
  if (minor === 0) return [`1.${major}`, `1.${major}.0`];
  return [`1.${major}.${minor}`];
}

function neoPrimaryMcVersion(neoVer: string): string | null {
  const candidates = neoVersionToMcCandidates(neoVer);
  return candidates[0] ?? null;
}

function neoMatchesMc(neoVer: string, mcVersion: string): boolean {
  return neoVersionToMcCandidates(neoVer).includes(mcVersion);
}

export async function listVersions(type: ServerType): Promise<string[]> {
  if (type === "VANILLA") {
    const manifest = await fetchJson<MojangManifest>(
      "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
    );
    return manifest.versions
      .filter((v) => v.type === "release")
      .map((v) => v.id);
  }

  if (type === "PAPER") {
    const project = await fetchJson<PaperProjectV3>(
      "https://fill.papermc.io/v3/projects/paper",
    );
    const all = Object.values(project.versions).flat();
    const stableLooking = all.filter((v) => !/(rc|pre|snapshot)/i.test(v));
    return stableLooking.length ? stableLooking : all;
  }

  if (type === "PURPUR") {
    const project = await fetchJson<PurpurProject>(
      "https://api.purpurmc.org/v2/purpur",
    );
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
    const games = await fetchJson<QuiltGameVersions>(
      "https://meta.quiltmc.org/v3/versions/game",
    );
    return games.filter((g) => g.stable).map((g) => g.version);
  }

  const games = await fetchJson<FabricGameVersions>(
    "https://meta.fabricmc.net/v2/versions/game",
  );
  return games.filter((g) => g.stable).map((g) => g.version);
}

// --- Downloads ---

interface VanillaVersionJson {
  downloads: { server: { url: string } };
}

export async function downloadVanilla(
  mcVersion: string,
  destDir: string,
): Promise<{ jarName: string }> {
  const manifest = await fetchJson<MojangManifest>(
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
  );
  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) throw new Error(`Vanilla version ${mcVersion} not found`);

  const versionJson = await fetchJson<VanillaVersionJson>(entry.url);
  const jarName = "server.jar";
  await downloadFile(versionJson.downloads.server.url, path.join(destDir, jarName));
  return { jarName };
}

export async function downloadPaper(
  mcVersion: string,
  destDir: string,
): Promise<{ jarName: string; paperBuild: number }> {
  const builds = await fetchJson<PaperBuildV3[]>(
    `https://fill.papermc.io/v3/projects/paper/versions/${mcVersion}/builds`,
  );
  if (!builds.length) {
    throw new Error(`No Paper builds for ${mcVersion}`);
  }

  const preferred =
    builds.find((b) => b.channel === "STABLE" && b.downloads["server:default"]) ??
    builds.find((b) => b.downloads["server:default"]);

  if (!preferred?.downloads["server:default"]) {
    throw new Error(`No downloadable Paper build for ${mcVersion}`);
  }

  const download = preferred.downloads["server:default"];
  const jarName = "server.jar";
  await downloadFile(download.url, path.join(destDir, jarName));
  return { jarName, paperBuild: preferred.id };
}

export async function downloadPurpur(
  mcVersion: string,
  destDir: string,
): Promise<{ jarName: string; paperBuild: number }> {
  const versionInfo = await fetchJson<PurpurVersion>(
    `https://api.purpurmc.org/v2/purpur/${mcVersion}`,
  );
  const build = versionInfo.builds?.latest;
  if (!build) {
    throw new Error(`No Purpur builds for ${mcVersion}`);
  }

  const buildNum = Number.parseInt(String(build), 10);
  if (Number.isNaN(buildNum)) {
    throw new Error(`Invalid Purpur build for ${mcVersion}: ${build}`);
  }

  const jarName = "server.jar";
  const url = `https://api.purpurmc.org/v2/purpur/${mcVersion}/${build}/download`;
  await downloadFile(url, path.join(destDir, jarName));
  return { jarName, paperBuild: buildNum };
}

export async function downloadFabric(
  mcVersion: string,
  destDir: string,
): Promise<{ jarName: string; fabricLoaderVersion: string }> {
  const loaders = await fetchJson<FabricLoaderVersions>(
    `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`,
  );
  const stable = loaders.find((l) => l.loader.stable) ?? loaders[0];
  if (!stable) {
    throw new Error(`No Fabric loader for Minecraft ${mcVersion}`);
  }
  const loaderVersion = stable.loader.version;

  const installerVersions = await fetchJson<{ version: string; stable: boolean }[]>(
    "https://meta.fabricmc.net/v2/versions/installer",
  );
  const installer =
    installerVersions.find((i) => i.stable) ?? installerVersions[0];
  if (!installer) throw new Error("No Fabric installer found");

  const jarName = "server.jar";
  const url = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/${installer.version}/server/jar`;
  await downloadFile(url, path.join(destDir, jarName));
  return { jarName, fabricLoaderVersion: loaderVersion };
}

export async function downloadQuilt(
  mcVersion: string,
  destDir: string,
): Promise<{ jarName: string; fabricLoaderVersion: string }> {
  const loaders = await fetchJson<QuiltLoaderVersions>(
    `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`,
  );
  const chosen = pickQuiltLoader(loaders);
  if (!chosen) {
    throw new Error(`No Quilt loader for Minecraft ${mcVersion}`);
  }
  const loaderVersion = chosen.loader.version;

  const installerVersions = await fetchJson<{ version: string; stable: boolean }[]>(
    "https://meta.quiltmc.org/v3/versions/installer",
  );
  const installer =
    installerVersions.find((i) => i.stable) ?? installerVersions[0];
  if (!installer) throw new Error("No Quilt installer found");

  const jarName = "server.jar";
  const url = `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}/${loaderVersion}/${installer.version}/server/jar`;
  await downloadFile(url, path.join(destDir, jarName));
  return { jarName, fabricLoaderVersion: loaderVersion };
}

function runForgeInstaller(
  installerJar: string,
  destDir: string,
  label = "Forge",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.javaPath, ["-jar", installerJar, "--installServer"], {
      cwd: destDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const onData = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.length > 20_000) output = output.slice(-20_000);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${label} installer failed (exit ${code ?? "?"}): ${output.trim().slice(-800)}`,
          ),
        );
      }
    });
  });
}

async function finishInstallerRuntime(
  destDir: string,
  fullVersion: string,
  label: "Forge" | "NeoForge",
): Promise<{ jarName: string; forgeVersion: string }> {
  await fs.mkdir(path.join(destDir, "mods"), { recursive: true });

  const runSh = path.join(destDir, "run.sh");
  if (existsSync(runSh)) {
    await fs.chmod(runSh, 0o755);
    await fs.writeFile(
      path.join(destDir, "user_jvm_args.txt"),
      "# JVM args managed by Guartrix (overwritten on start with server memory)\n-Xms2048M\n-Xmx2048M\n",
      "utf8",
    );
    return { jarName: "run.sh", forgeVersion: fullVersion };
  }

  // Legacy Forge (< 1.17): forge-<mc>-<forge>.jar
  const entries = await fs.readdir(destDir);
  const jarPrefix = label === "NeoForge" ? "neoforge-" : "forge-";
  const runtimeJar = entries.find(
    (name) =>
      name.startsWith(jarPrefix) &&
      name.endsWith(".jar") &&
      !name.includes("installer"),
  );
  if (!runtimeJar) {
    throw new Error(
      `${label} install finished but no run.sh or ${jarPrefix}jar was found`,
    );
  }
  await fs.copyFile(path.join(destDir, runtimeJar), path.join(destDir, "server.jar"));
  return { jarName: "server.jar", forgeVersion: fullVersion };
}

export async function downloadForge(
  mcVersion: string,
  destDir: string,
): Promise<{ jarName: string; forgeVersion: string }> {
  const promo = await fetchJson<ForgePromotions>(
    "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
  );
  const forgeBuild =
    promo.promos[`${mcVersion}-recommended`] ?? promo.promos[`${mcVersion}-latest`];
  if (!forgeBuild) {
    throw new Error(`No Forge build for Minecraft ${mcVersion}`);
  }

  const fullVersion = `${mcVersion}-${forgeBuild}`;
  const installerName = `forge-${fullVersion}-installer.jar`;
  const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersion}/${installerName}`;
  const installerPath = path.join(destDir, installerName);

  await downloadFile(installerUrl, installerPath);
  await runForgeInstaller(installerPath, destDir, "Forge");

  // Cleanup installer leftovers
  await fs.rm(installerPath, { force: true }).catch(() => undefined);
  await fs.rm(`${installerPath}.log`, { force: true }).catch(() => undefined);
  await fs.rm(path.join(destDir, "installer.log"), { force: true }).catch(() => undefined);

  return finishInstallerRuntime(destDir, fullVersion, "Forge");
}

export async function downloadNeoForge(
  mcVersion: string,
  destDir: string,
): Promise<{ jarName: string; forgeVersion: string }> {
  const data = await fetchJson<NeoForgeVersions>(
    "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge",
  );
  const matching = data.versions
    .filter((v) => !/(beta|rc|snapshot|alpha)/i.test(v) && neoMatchesMc(v, mcVersion))
    .sort(compareMcVersions);
  const neoVer = matching[0];
  if (!neoVer) {
    throw new Error(`No NeoForge build for Minecraft ${mcVersion}`);
  }

  const installerName = `neoforge-${neoVer}-installer.jar`;
  const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVer}/${installerName}`;
  const installerPath = path.join(destDir, installerName);

  await downloadFile(installerUrl, installerPath);
  await runForgeInstaller(installerPath, destDir, "NeoForge");

  await fs.rm(installerPath, { force: true }).catch(() => undefined);
  await fs.rm(`${installerPath}.log`, { force: true }).catch(() => undefined);
  await fs.rm(path.join(destDir, "installer.log"), { force: true }).catch(() => undefined);

  return finishInstallerRuntime(destDir, neoVer, "NeoForge");
}

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
  await fs.copyFile(
    DEFAULT_SERVER_ICON_PATH,
    path.join(destDir, "server-icon.png"),
  );

  const defaultProperties = [
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
    "",
  ].join("\n");
  await fs.writeFile(
    path.join(destDir, "server.properties"),
    defaultProperties,
    "utf8",
  );

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

export async function getLatestPaperBuild(mcVersion: string): Promise<number | null> {
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

export async function getLatestPurpurBuild(mcVersion: string): Promise<number | null> {
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
