import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "../db.js";
import { logger } from "../logger.js";
import { TAR_EXCLUDES } from "./backup-paths.js";

export const MYSQL_BACKUP_DIR = "guartrix-mysql";

const execFileAsync = promisify(execFile);

export async function embedMysqlDumpsInArchive(
  serverId: string,
  archivePath: string,
): Promise<void> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { nodeId: true },
  });
  if (!server) return;
  const dbs = await prisma.database.findMany({
    where: { serverId },
    select: { name: true },
  });
  if (dbs.length === 0) return;

  const stage = `${archivePath}.mysql-stage-${process.pid}`;
  await fs.mkdir(stage, { recursive: true });
  try {
    await execFileAsync("tar", ["-xzf", archivePath, "-C", stage], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const mysqlDir = path.join(stage, MYSQL_BACKUP_DIR);
    await fs.mkdir(mysqlDir, { recursive: true });
    const { daemonMysqlDumpToFile } = await import("../nodes/daemon-client.js");
    for (const db of dbs) {
      const dumpPath = path.join(mysqlDir, `${db.name}.sql`);
      await daemonMysqlDumpToFile(server.nodeId!, db.name, dumpPath);
    }
    await fs.writeFile(
      path.join(mysqlDir, "manifest.json"),
      `${JSON.stringify({ version: 1, databases: dbs.map((d) => d.name) }, null, 2)}\n`,
      "utf8",
    );
    const repacked = `${archivePath}.repack`;
    await execFileAsync("tar", ["-czf", repacked, ...TAR_EXCLUDES, "-C", stage, "."], {
      maxBuffer: 16 * 1024 * 1024,
    });
    await fs.rename(repacked, archivePath);
  } finally {
    await fs.rm(stage, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function restoreMysqlFromBackupDir(serverId: string, dest: string): Promise<void> {
  const mysqlDir = path.join(dest, MYSQL_BACKUP_DIR);
  try {
    await fs.access(mysqlDir);
  } catch {
    return;
  }
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { nodeId: true },
  });
  if (!server) return;
  let databases: string[] = [];
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(mysqlDir, "manifest.json"), "utf8"),
    ) as { databases?: string[] };
    databases = Array.isArray(manifest.databases) ? manifest.databases : [];
  } catch {
    const entries = await fs.readdir(mysqlDir);
    databases = entries.filter((n) => n.endsWith(".sql")).map((n) => n.replace(/\.sql$/, ""));
  }
  const { daemonMysqlRestoreFromFile } = await import("../nodes/daemon-client.js");
  for (const name of databases) {
    const sqlPath = path.join(mysqlDir, `${name}.sql`);
    try {
      await fs.access(sqlPath);
      await daemonMysqlRestoreFromFile(server.nodeId!, name, sqlPath);
    } catch (err) {
      logger.warn({ err, serverId, name }, "mysql restore from backup failed");
    }
  }
  await fs.rm(mysqlDir, { recursive: true, force: true }).catch(() => undefined);
}
