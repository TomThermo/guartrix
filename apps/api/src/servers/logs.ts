import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { LogContentResponse, LogFileInfo } from "@guartrix/shared";
import { formatBytes } from "@guartrix/shared";
import { serverDir } from "../config.js";

async function collectFromDir(
  serverId: string,
  relDir: string,
  files: LogFileInfo[],
): Promise<void> {
  const abs = path.join(serverDir(serverId), relDir);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/\.(log|txt)$/i.test(entry.name) && !/crash/i.test(entry.name)) continue;
    const rel = path.posix.join(relDir.replace(/\\/g, "/"), entry.name);
    const full = path.join(abs, entry.name);
    try {
      const st = await fs.stat(full);
      files.push({
        name: entry.name,
        path: rel,
        sizeBytes: st.size,
        sizeLabel: formatBytes(st.size),
        modifiedAt: st.mtime.toISOString(),
      });
    } catch {
      // ignore
    }
  }
}

export async function listLogFiles(serverId: string): Promise<LogFileInfo[]> {
  const files: LogFileInfo[] = [];
  await collectFromDir(serverId, "logs", files);
  await collectFromDir(serverId, "crash-reports", files);
  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return files;
}

export async function readLogFile(
  serverId: string,
  relPath: string,
  maxBytes = 512 * 1024,
): Promise<LogContentResponse> {
  const cleaned = relPath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (
    cleaned.includes("..") ||
    (!cleaned.startsWith("logs/") && !cleaned.startsWith("crash-reports/"))
  ) {
    throw new Error("Invalid log path");
  }
  const full = path.join(serverDir(serverId), cleaned);
  const st = await fs.stat(full);
  if (!st.isFile()) throw new Error("Not a file");

  if (st.size <= maxBytes) {
    const content = await fs.readFile(full, "utf8");
    return {
      path: cleaned,
      content,
      truncated: false,
      sizeBytes: st.size,
    };
  }

  // Read the tail
  const fh = await fs.open(full, "r");
  try {
    const start = st.size - maxBytes;
    const buf = Buffer.alloc(maxBytes);
    await fh.read(buf, 0, maxBytes, start);
    let text = buf.toString("utf8");
    const firstNl = text.indexOf("\n");
    if (firstNl >= 0 && firstNl < 200) text = text.slice(firstNl + 1);
    return {
      path: cleaned,
      content: text,
      truncated: true,
      sizeBytes: st.size,
    };
  } finally {
    await fh.close();
  }
}
