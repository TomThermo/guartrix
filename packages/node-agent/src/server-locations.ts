import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export interface ServerLocationEntry {
  /** Absolute data root (mount point); servers live at `{dataRoot}/servers/<id>`. */
  dataRoot: string;
}

type LocationMap = Record<string, ServerLocationEntry>;

let dataDir = "";
let cache: LocationMap | null = null;

/** Wire locations file under the daemon DATA_DIR (call once from config). */
export function initServerLocations(dir: string): void {
  dataDir = dir;
  cache = null;
}

function assertSafeServerId(serverId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(serverId)) {
    throw new Error("Invalid server id");
  }
  return serverId;
}

function locationsFile(): string {
  if (!dataDir) {
    throw new Error("server locations not initialized");
  }
  return path.join(dataDir, "server-locations.json");
}

function loadSync(): LocationMap {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(locationsFile(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      cache = parsed as LocationMap;
      return cache;
    }
  } catch {
    /* missing or invalid */
  }
  cache = {};
  return cache;
}

async function persist(map: LocationMap): Promise<void> {
  await fsp.mkdir(dataDir, { recursive: true });
  const tmp = `${locationsFile()}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(map, null, 2)}\n`, "utf8");
  await fsp.rename(tmp, locationsFile());
  cache = map;
}

/** Absolute data root for a server, or null when using default DATA_DIR. */
export function getServerDataRoot(serverId: string): string | null {
  const id = assertSafeServerId(serverId);
  const entry = loadSync()[id];
  const root = entry?.dataRoot?.trim();
  return root ? path.resolve(root) : null;
}

/** Persist or clear the data root override for a server. */
export async function setServerDataRoot(
  serverId: string,
  dataRoot: string | null,
): Promise<void> {
  const id = assertSafeServerId(serverId);
  const map = { ...loadSync() };
  if (!dataRoot?.trim()) {
    delete map[id];
  } else {
    map[id] = { dataRoot: path.resolve(dataRoot.trim()) };
  }
  await persist(map);
}

/** List server ids whose data root equals or is under `mountPoint`. */
export function serverIdsUnderMount(mountPoint: string): string[] {
  const root = path.resolve(mountPoint);
  const map = loadSync();
  const out: string[] = [];
  for (const [id, entry] of Object.entries(map)) {
    const dr = path.resolve(entry.dataRoot);
    if (dr === root || dr.startsWith(`${root}${path.sep}`)) {
      out.push(id);
    }
  }
  return out;
}
