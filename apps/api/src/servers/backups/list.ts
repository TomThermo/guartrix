import fs from "node:fs/promises";
import path from "node:path";
import type { ServerBackup } from "@guartrix/shared";
import { formatBytes } from "@guartrix/shared";
import { serverBackupsDir } from "../../config.js";
import { archivePath, encryptedPath, metaPath } from "../backup-paths.js";

export async function listBackups(serverId: string): Promise<ServerBackup[]> {
  const dir = serverBackupsDir(serverId);
  await fs.mkdir(dir, { recursive: true });
  const names = await fs.readdir(dir);
  const backups: ServerBackup[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const encrypted = name.endsWith(".tar.gz.enc");
    const plain = name.endsWith(".tar.gz") && !encrypted;
    if (!encrypted && !plain) continue;
    const id = encrypted ? name.replace(/\.tar\.gz\.enc$/, "") : name.replace(/\.tar\.gz$/, "");
    if (seen.has(id)) continue;
    seen.add(id);

    const archive = path.join(dir, name);
    const st = await fs.stat(archive).catch(() => null);
    if (!st) continue;

    let note: string | null = null;
    let trigger: ServerBackup["trigger"] = "manual";
    let createdAt = st.mtime.toISOString();
    let metaEncrypted = encrypted;
    try {
      const meta = JSON.parse(await fs.readFile(metaPath(serverId, id), "utf8")) as {
        note?: string | null;
        trigger?: ServerBackup["trigger"];
        createdAt?: string;
        encrypted?: boolean;
      };
      note = meta.note ?? null;
      trigger = meta.trigger ?? "manual";
      createdAt = meta.createdAt ?? createdAt;
      if (typeof meta.encrypted === "boolean") metaEncrypted = meta.encrypted;
    } catch {
      // no meta
    }

    backups.push({
      id,
      fileName: name,
      sizeBytes: st.size,
      sizeLabel: formatBytes(st.size),
      createdAt,
      note,
      trigger,
      encrypted: metaEncrypted || encrypted,
    });
  }

  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return backups;
}

export async function pruneBackups(serverId: string, keepCount: number): Promise<void> {
  const backups = await listBackups(serverId);
  const extra = backups.slice(Math.max(1, keepCount));
  for (const b of extra) {
    await fs.rm(archivePath(serverId, b.id), { force: true }).catch(() => undefined);
    await fs.rm(encryptedPath(serverId, b.id), { force: true }).catch(() => undefined);
    await fs.rm(metaPath(serverId, b.id), { force: true }).catch(() => undefined);
  }
}
