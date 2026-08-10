import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ServerType } from "@guartrix/shared";
import { BEDROCK_BINARY, POCKETMINE_PHAR } from "@guartrix/shared";
import { safeExtractArchive } from "@guartrix/node-agent";
import { compareMcVersions } from "./jars.js";

const USER_AGENT = "Guartrix/1.0 (MinecraftServerManager; contact@localhost)";

const ENDSTONE_VERSIONS_URL =
  "https://raw.githubusercontent.com/EndstoneMC/bedrock-server-data/v2/versions.json";

interface EndstoneVersionsRegistry {
  release: { latest: string; versions: string[] };
  preview: { latest: string; versions: string[] };
}

interface BedrockMetadata {
  version: string;
  binary: {
    linux: { url: string; sha256?: string };
  };
}

interface GithubRelease {
  tag_name: string;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

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

async function verifyFileSha256(filePath: string, expected: string): Promise<void> {
  const hash = createHash("sha256");
  const data = await fs.readFile(filePath);
  hash.update(data);
  const got = hash.digest("hex").toLowerCase();
  const want = expected.trim().toLowerCase();
  if (got !== want) {
    throw new Error("Bedrock download checksum mismatch");
  }
}

async function extractBedrockZip(zipPath: string, destDir: string): Promise<void> {
  await safeExtractArchive(zipPath, destDir);
}

async function cachedEndstoneVersions(): Promise<EndstoneVersionsRegistry> {
  return fetchJson<EndstoneVersionsRegistry>(ENDSTONE_VERSIONS_URL);
}

async function bedrockMetadata(version: string, preview: boolean): Promise<BedrockMetadata> {
  const channel = preview ? "preview" : "release";
  const url = `https://raw.githubusercontent.com/EndstoneMC/bedrock-server-data/v2/${channel}/${version}/metadata.json`;
  return fetchJson<BedrockMetadata>(url);
}

export async function listBedrockStableVersions(): Promise<string[]> {
  const data = await cachedEndstoneVersions();
  return [...data.release.versions].sort(compareMcVersions);
}

export async function listBedrockPreviewVersions(): Promise<string[]> {
  const data = await cachedEndstoneVersions();
  return [...data.preview.versions].sort(compareMcVersions);
}

export async function downloadBedrock(
  mcVersion: string,
  destDir: string,
  preview = false,
): Promise<{ jarName: string }> {
  const meta = await bedrockMetadata(mcVersion, preview);
  const url = meta.binary.linux?.url;
  if (!url) throw new Error(`No Linux BDS download for ${mcVersion}`);

  const zipPath = path.join(destDir, "bedrock-server.zip");
  await downloadFile(url, zipPath);
  const expectedSha = meta.binary.linux?.sha256?.trim();
  if (expectedSha) {
    await verifyFileSha256(zipPath, expectedSha);
  }
  await extractBedrockZip(zipPath, destDir);
  await fs.rm(zipPath, { force: true }).catch(() => undefined);

  const binaryPath = path.join(destDir, BEDROCK_BINARY);
  await fs.chmod(binaryPath, 0o755).catch(() => undefined);

  return { jarName: BEDROCK_BINARY };
}

export async function listPocketMineVersions(): Promise<string[]> {
  const releases = await fetchJson<GithubRelease[]>(
    "https://api.github.com/repos/pmmp/PocketMine-MP/releases?per_page=50",
  );
  return releases
    .filter((r) => !r.prerelease)
    .map((r) => r.tag_name)
    .sort((a, b) => compareMcVersions(a, b));
}

export async function downloadPocketMine(
  pmVersion: string,
  destDir: string,
): Promise<{ jarName: string }> {
  const release = await fetchJson<GithubRelease>(
    `https://api.github.com/repos/pmmp/PocketMine-MP/releases/tags/${encodeURIComponent(pmVersion)}`,
  );
  const phar = release.assets.find((a) => a.name === POCKETMINE_PHAR);
  if (!phar) {
    throw new Error(`PocketMine-MP.phar not found for release ${pmVersion}`);
  }
  const dest = path.join(destDir, POCKETMINE_PHAR);
  await downloadFile(phar.browser_download_url, dest);
  return { jarName: POCKETMINE_PHAR };
}

/** Nukkit publishes a single rolling snapshot via OpenCollab Maven. */
export async function listNukkitVersions(): Promise<string[]> {
  return ["latest"];
}

export async function downloadNukkit(
  _mcVersion: string,
  destDir: string,
): Promise<{ jarName: string }> {
  const url =
    "https://repo.opencollab.dev/api/maven/latest/file/maven-snapshots/cn/nukkit/nukkit/1.0-SNAPSHOT?extension=jar";
  const jarName = "server.jar";
  await downloadFile(url, path.join(destDir, jarName));
  return { jarName };
}

export async function getLatestBedrockStableVersion(): Promise<string | null> {
  try {
    const data = await cachedEndstoneVersions();
    return data.release.latest ?? data.release.versions[0] ?? null;
  } catch {
    return null;
  }
}

export async function getLatestBedrockPreviewVersion(): Promise<string | null> {
  try {
    const data = await cachedEndstoneVersions();
    return data.preview.latest ?? data.preview.versions[0] ?? null;
  } catch {
    return null;
  }
}

export async function getLatestPocketMineVersion(): Promise<string | null> {
  try {
    const versions = await listPocketMineVersions();
    return versions[0] ?? null;
  } catch {
    return null;
  }
}

export function isBedrockDownloadType(type: ServerType): boolean {
  return (
    type === "BEDROCK" || type === "BEDROCK_PREVIEW" || type === "POCKETMINE" || type === "NUKKIT"
  );
}
