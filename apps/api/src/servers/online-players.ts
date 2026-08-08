import type { OnlinePlayer, OnlinePlayersResponse } from "@msm/shared";
import { prisma } from "../db.js";
import { pingMinecraftServer } from "../mc-ping.js";
import { listPlayerHistory, touchOnlinePlayers } from "@msm/node-agent";
import { processManager } from "./process-manager.js";

function emptyOnline(partial?: Partial<OnlinePlayersResponse>): OnlinePlayersResponse {
  return {
    online: false,
    playersOnline: 0,
    playersMax: 0,
    players: [],
    history: [],
    source: "none",
    latencyMs: null,
    ...partial,
  };
}

/**
 * Fast path for dashboard polls: in-memory WS/daemon event cache only —
 * no per-server HTTP round-trips to the node.
 */
export async function getOnlinePlayersCached(serverId: string): Promise<OnlinePlayersResponse> {
  const names = processManager.getOnlinePlayerNames(serverId);
  const managedRunning = processManager.isRunning(serverId);

  const players: OnlinePlayer[] = [...names]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name) => ({ name, uuid: null }));

  return {
    online: managedRunning || players.length > 0,
    playersOnline: players.length,
    playersMax: 0,
    players,
    history: [],
    source: players.length > 0 ? "console" : "none",
    latencyMs: null,
  };
}

export async function getOnlinePlayers(
  serverId: string,
  opts?: { skipPing?: boolean },
): Promise<OnlinePlayersResponse> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) return emptyOnline();

  const tracked = await processManager
    .refreshPlayers(serverId)
    .catch(() => processManager.getOnlinePlayerNames(serverId));
  const managedRunning = await processManager
    .refreshRunning(serverId)
    .catch(() => processManager.isRunning(serverId));

  // Prefer console-tracked names; only ping when we need sample UUIDs / max players
  // or when the console list is empty (and skipPing is not set).
  const ping =
    opts?.skipPing || tracked.length > 0
      ? {
          online: false,
          playersOnline: 0,
          playersMax: 0,
          sample: [] as Array<{ name: string; id: string }>,
          latencyMs: null as number | null,
        }
      : await pingMinecraftServer("127.0.0.1", server.port, 800);

  const uuidByName = new Map<string, string>();
  for (const sample of ping.sample) {
    if (sample.name && sample.id) uuidByName.set(sample.name, sample.id);
  }

  const nameSet = new Set<string>(tracked.length > 0 ? tracked : ping.sample.map((s) => s.name));
  for (const sample of ping.sample) {
    if (sample.name) nameSet.add(sample.name);
  }

  const players: OnlinePlayer[] = [...nameSet]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name) => ({
      name,
      uuid: uuidByName.get(name) ?? null,
    }));

  if (players.length > 0) {
    await touchOnlinePlayers(
      serverId,
      players.map((p) => p.name),
      uuidByName,
    );
  }

  const onlineLower = new Set(players.map((p) => p.name.toLowerCase()));
  const history = await listPlayerHistory(serverId, onlineLower);
  const offlineHistory = history.filter((h) => !h.online);

  if (!ping.online && tracked.length === 0 && players.length === 0) {
    return emptyOnline({
      online: managedRunning,
      history: offlineHistory,
    });
  }

  const playersOnline = Math.max(ping.online ? ping.playersOnline : 0, players.length);

  let source: OnlinePlayersResponse["source"] = "none";
  if (tracked.length > 0 && ping.online) source = "both";
  else if (tracked.length > 0) source = "console";
  else if (ping.online) source = "ping";

  return {
    online: ping.online || managedRunning || tracked.length > 0,
    playersOnline,
    playersMax: ping.playersMax || 0,
    players,
    history: offlineHistory,
    source,
    latencyMs: ping.latencyMs,
  };
}

/** Dashboard bulk online map — cache only, visible ids. */
export async function getAllOnlinePlayers(
  serverIds: string[],
): Promise<Record<string, OnlinePlayersResponse>> {
  const entries = await Promise.all(
    serverIds.map(async (id) => [id, await getOnlinePlayersCached(id)] as const),
  );
  return Object.fromEntries(entries);
}
