import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getServerDataRoot, initServerLocations } from "./server-locations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveRootDir(): string {
  if (process.env.GUARTRIX_ROOT) {
    return path.resolve(process.env.GUARTRIX_ROOT);
  }
  // packages/node-agent/src → monorepo root
  const fromPackage = path.resolve(__dirname, "../../../");
  try {
    // Prefer package-relative root when it looks like the monorepo
    return fromPackage;
  } catch {
    return process.cwd();
  }
}

const rootDir = resolveRootDir();

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, "data/daemon.env") });

export const config = {
  dataDir: path.resolve(rootDir, process.env.DATA_DIR ?? "./data"),
  dockerImage: process.env.DOCKER_IMAGE ?? "eclipse-temurin:25-jre-jammy",
  publicHost: process.env.PUBLIC_HOST ?? process.env.HOST ?? "127.0.0.1",
  rootDir,
};

initServerLocations(config.dataDir);

export function assertSafeServerId(serverId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(serverId)) {
    throw new Error("Invalid server id");
  }
  return serverId;
}

function dataRootFor(serverId: string): string {
  return getServerDataRoot(serverId) ?? config.dataDir;
}

export function serverDir(serverId: string): string {
  const id = assertSafeServerId(serverId);
  return path.join(dataRootFor(id), "servers", id);
}

export function backupsRootDir(): string {
  return path.join(config.dataDir, "backups");
}

export function serverBackupsDir(serverId: string): string {
  const id = assertSafeServerId(serverId);
  const root = getServerDataRoot(id);
  if (root) return path.join(root, "backups", id);
  return path.join(backupsRootDir(), id);
}
