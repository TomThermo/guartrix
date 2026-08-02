import fs from "node:fs/promises";
import path from "node:path";
import type { PlayerHistoryEntry } from "@msm/shared";
import { serverDir } from "./config.js";

const MAX_ENTRIES = 100;

interface HistoryFile {
  players: StoredPlayer[];
}

interface StoredPlayer {
  name: string;
  uuid: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastJoinedAt: string | null;
  lastLeftAt: string | null;
}

function historyPath(serverId: string): string {
  return path.join(serverDir(serverId), "guartrix-player-history.json");
}

async function readFile(serverId: string): Promise<HistoryFile> {
  try {
    const raw = await fs.readFile(historyPath(serverId), "utf8");
    const data = JSON.parse(raw) as HistoryFile;
    return { players: Array.isArray(data.players) ? data.players : [] };
  } catch {
    return { players: [] };
  }
}

async function writeFile(serverId: string, data: HistoryFile): Promise<void> {
  await fs.mkdir(serverDir(serverId), { recursive: true });
  // Keep most recently seen first, cap size
  data.players.sort(
    (a, b) =>
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
  );
  if (data.players.length > MAX_ENTRIES) {
    data.players = data.players.slice(0, MAX_ENTRIES);
  }
  await fs.writeFile(
    historyPath(serverId),
    JSON.stringify(data, null, 2) + "\n",
    "utf8",
  );
}

function findIndex(players: StoredPlayer[], name: string): number {
  const lower = name.toLowerCase();
  return players.findIndex((p) => p.name.toLowerCase() === lower);
}

export async function recordPlayerJoin(
  serverId: string,
  name: string,
  uuid?: string | null,
): Promise<void> {
  const data = await readFile(serverId);
  const now = new Date().toISOString();
  const idx = findIndex(data.players, name);
  if (idx >= 0) {
    const existing = data.players[idx]!;
    existing.name = name;
    existing.lastSeenAt = now;
    existing.lastJoinedAt = now;
    existing.lastLeftAt = null;
    if (uuid) existing.uuid = uuid;
  } else {
    data.players.push({
      name,
      uuid: uuid ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
      lastJoinedAt: now,
      lastLeftAt: null,
    });
  }
  await writeFile(serverId, data);
}

export async function recordPlayerLeave(
  serverId: string,
  name: string,
  uuid?: string | null,
): Promise<void> {
  const data = await readFile(serverId);
  const now = new Date().toISOString();
  const idx = findIndex(data.players, name);
  if (idx >= 0) {
    const existing = data.players[idx]!;
    existing.lastSeenAt = now;
    existing.lastLeftAt = now;
    if (uuid) existing.uuid = uuid;
  } else {
    data.players.push({
      name,
      uuid: uuid ?? null,
      firstSeenAt: now,
      lastSeenAt: now,
      lastJoinedAt: null,
      lastLeftAt: now,
    });
  }
  await writeFile(serverId, data);
}

/** Upsert currently online players without marking others as left (safe for partial ping samples). */
export async function touchOnlinePlayers(
  serverId: string,
  onlineNames: string[],
  uuidByName?: Map<string, string>,
): Promise<void> {
  if (!onlineNames.length) return;
  const data = await readFile(serverId);
  const now = new Date().toISOString();

  for (const name of onlineNames) {
    const idx = findIndex(data.players, name);
    const uuid = uuidByName?.get(name) ?? null;
    if (idx >= 0) {
      const existing = data.players[idx]!;
      existing.name = name;
      existing.lastSeenAt = now;
      if (existing.lastLeftAt) {
        existing.lastJoinedAt = now;
        existing.lastLeftAt = null;
      } else if (!existing.lastJoinedAt) {
        existing.lastJoinedAt = now;
      }
      if (uuid) existing.uuid = uuid;
    } else {
      data.players.push({
        name,
        uuid,
        firstSeenAt: now,
        lastSeenAt: now,
        lastJoinedAt: now,
        lastLeftAt: null,
      });
    }
  }

  await writeFile(serverId, data);
}

/** Full sync from /list — anyone missing from the complete online set is marked left. */
export async function syncOnlineSet(
  serverId: string,
  onlineNames: string[],
  uuidByName?: Map<string, string>,
): Promise<void> {
  await touchOnlinePlayers(serverId, onlineNames, uuidByName);
  const data = await readFile(serverId);
  const now = new Date().toISOString();
  const onlineLower = new Set(onlineNames.map((n) => n.toLowerCase()));

  for (const player of data.players) {
    if (!player.lastLeftAt && !onlineLower.has(player.name.toLowerCase())) {
      if (player.lastJoinedAt) {
        player.lastLeftAt = now;
        player.lastSeenAt = now;
      }
    }
  }

  await writeFile(serverId, data);
}

export async function listPlayerHistory(
  serverId: string,
  currentlyOnline: Set<string>,
): Promise<PlayerHistoryEntry[]> {
  const data = await readFile(serverId);
  return data.players
    .map((p) => {
      const online = currentlyOnline.has(p.name.toLowerCase());
      return {
        name: p.name,
        uuid: p.uuid,
        firstSeenAt: p.firstSeenAt,
        lastSeenAt: p.lastSeenAt,
        lastJoinedAt: p.lastJoinedAt,
        lastLeftAt: online ? null : p.lastLeftAt,
        online,
      } satisfies PlayerHistoryEntry;
    })
    .sort(
      (a, b) =>
        new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );
}
