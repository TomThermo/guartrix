import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export const USER_AGENT =
  "Guartrix/1.0 (MinecraftServerManager; contact@localhost)";

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.json() as Promise<T>;
}

export async function downloadFile(url: string, dest: string): Promise<void> {
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
