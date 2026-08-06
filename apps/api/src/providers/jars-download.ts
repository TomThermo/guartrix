import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { config } from "../config.js";
import { downloadFile, fetchJson } from "./jars-http.js";
import {
  compareMcVersions,
  neoMatchesMc,
  pickQuiltLoader,
} from "./jars-versions.js";
import type {
  FabricLoaderVersions,
  ForgePromotions,
  MojangManifest,
  NeoForgeVersions,
  PaperBuildV3,
  PurpurVersion,
  QuiltLoaderVersions,
} from "./jars-versions.js";

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
  await fs
    .rm(path.join(destDir, "installer.log"), { force: true })
    .catch(() => undefined);

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
  await fs
    .rm(path.join(destDir, "installer.log"), { force: true })
    .catch(() => undefined);

  return finishInstallerRuntime(destDir, neoVer, "NeoForge");
}
