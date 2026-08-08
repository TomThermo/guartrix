import type { BanEntry, BansResponse, IpBanEntry } from "@msm/shared";
import { processManager } from "../process-manager.js";
import { banTimestamp, readJsonArray, resolvePlayer, runLive, writeJsonArray } from "./helpers.js";

function normalizePlayerBan(raw: {
  name?: string;
  uuid?: string;
  created?: string;
  source?: string;
  expires?: string;
  reason?: string;
}): BanEntry | null {
  if (!raw.name || !raw.uuid) return null;
  return {
    name: raw.name,
    uuid: raw.uuid,
    created: raw.created ?? banTimestamp(),
    source: raw.source ?? "Guartrix",
    expires: raw.expires ?? "forever",
    reason: raw.reason ?? "Banned by an operator.",
  };
}

function normalizeIpBan(raw: {
  ip?: string;
  created?: string;
  source?: string;
  expires?: string;
  reason?: string;
}): IpBanEntry | null {
  if (!raw.ip) return null;
  return {
    ip: raw.ip,
    created: raw.created ?? banTimestamp(),
    source: raw.source ?? "Guartrix",
    expires: raw.expires ?? "forever",
    reason: raw.reason ?? "Banned by an operator.",
  };
}

export async function readBans(serverId: string): Promise<BansResponse> {
  const playersRaw = await readJsonArray<{
    name?: string;
    uuid?: string;
    created?: string;
    source?: string;
    expires?: string;
    reason?: string;
  }>(serverId, "banned-players.json");
  const ipsRaw = await readJsonArray<{
    ip?: string;
    created?: string;
    source?: string;
    expires?: string;
    reason?: string;
  }>(serverId, "banned-ips.json");

  return {
    players: playersRaw.map(normalizePlayerBan).filter((e): e is BanEntry => e !== null),
    ips: ipsRaw.map(normalizeIpBan).filter((e): e is IpBanEntry => e !== null),
  };
}

export async function addPlayerBan(
  serverId: string,
  _dir: string,
  name: string,
  reason = "Banned by an operator.",
  expires = "forever",
): Promise<BansResponse> {
  const player = await resolvePlayer(name);
  const list = (await readJsonArray<BanEntry>(serverId, "banned-players.json"))
    .map(normalizePlayerBan)
    .filter((e): e is BanEntry => e !== null);

  if (list.some((e) => e.name.toLowerCase() === player.name.toLowerCase())) {
    throw new Error(`${player.name} is already banned`);
  }

  const entry: BanEntry = {
    uuid: player.uuid,
    name: player.name,
    created: banTimestamp(),
    source: "Guartrix",
    expires: expires.trim() || "forever",
    reason: reason.trim() || "Banned by an operator.",
  };
  list.push(entry);
  await writeJsonArray(serverId, "banned-players.json", list);

  const liveReason = entry.reason.replace(/[\r\n]+/g, " ").trim();
  runLive(serverId, liveReason ? `ban ${player.name} ${liveReason}` : `ban ${player.name}`);
  return readBans(serverId);
}

export async function updatePlayerBan(
  serverId: string,
  _dir: string,
  name: string,
  patch: { reason?: string; expires?: string },
): Promise<BansResponse> {
  const list = (await readJsonArray<BanEntry>(serverId, "banned-players.json"))
    .map(normalizePlayerBan)
    .filter((e): e is BanEntry => e !== null);
  const idx = list.findIndex((e) => e.name.toLowerCase() === name.toLowerCase());
  if (idx < 0) throw new Error(`${name} is not banned`);

  const current = list[idx]!;
  const next: BanEntry = {
    ...current,
    reason:
      patch.reason !== undefined ? patch.reason.trim() || "Banned by an operator." : current.reason,
    expires: patch.expires !== undefined ? patch.expires.trim() || "forever" : current.expires,
  };
  list[idx] = next;
  await writeJsonArray(serverId, "banned-players.json", list);

  if (processManager.isRunning(serverId)) {
    runLive(serverId, `pardon ${current.name}`);
    const liveReason = next.reason.replace(/[\r\n]+/g, " ").trim();
    runLive(serverId, liveReason ? `ban ${current.name} ${liveReason}` : `ban ${current.name}`);
  }

  return readBans(serverId);
}

export async function removePlayerBan(
  serverId: string,
  _dir: string,
  name: string,
): Promise<BansResponse> {
  const list = (await readJsonArray<BanEntry>(serverId, "banned-players.json"))
    .map(normalizePlayerBan)
    .filter((e): e is BanEntry => e !== null);
  const next = list.filter((e) => e.name.toLowerCase() !== name.toLowerCase());
  if (next.length === list.length) {
    throw new Error(`${name} is not banned`);
  }
  await writeJsonArray(serverId, "banned-players.json", next);
  runLive(serverId, `pardon ${name}`);
  return readBans(serverId);
}

export async function addIpBan(
  serverId: string,
  _dir: string,
  ip: string,
  reason = "Banned by an operator.",
  expires = "forever",
): Promise<BansResponse> {
  const cleaned = ip.trim();
  if (!/^[\d.:a-fA-F]+$/.test(cleaned) || cleaned.length < 3) {
    throw new Error("Invalid IP address");
  }
  const list = (await readJsonArray<IpBanEntry>(serverId, "banned-ips.json"))
    .map(normalizeIpBan)
    .filter((e): e is IpBanEntry => e !== null);
  if (list.some((e) => e.ip === cleaned)) {
    throw new Error(`${cleaned} is already banned`);
  }

  const entry: IpBanEntry = {
    ip: cleaned,
    created: banTimestamp(),
    source: "Guartrix",
    expires: expires.trim() || "forever",
    reason: reason.trim() || "Banned by an operator.",
  };
  list.push(entry);
  await writeJsonArray(serverId, "banned-ips.json", list);

  const liveReason = entry.reason.replace(/[\r\n]+/g, " ").trim();
  runLive(serverId, liveReason ? `ban-ip ${cleaned} ${liveReason}` : `ban-ip ${cleaned}`);
  return readBans(serverId);
}

export async function updateIpBan(
  serverId: string,
  _dir: string,
  ip: string,
  patch: { reason?: string; expires?: string },
): Promise<BansResponse> {
  const list = (await readJsonArray<IpBanEntry>(serverId, "banned-ips.json"))
    .map(normalizeIpBan)
    .filter((e): e is IpBanEntry => e !== null);
  const idx = list.findIndex((e) => e.ip === ip);
  if (idx < 0) throw new Error(`${ip} is not banned`);

  const current = list[idx]!;
  const next: IpBanEntry = {
    ...current,
    reason:
      patch.reason !== undefined ? patch.reason.trim() || "Banned by an operator." : current.reason,
    expires: patch.expires !== undefined ? patch.expires.trim() || "forever" : current.expires,
  };
  list[idx] = next;
  await writeJsonArray(serverId, "banned-ips.json", list);

  if (processManager.isRunning(serverId)) {
    runLive(serverId, `pardon-ip ${current.ip}`);
    const liveReason = next.reason.replace(/[\r\n]+/g, " ").trim();
    runLive(serverId, liveReason ? `ban-ip ${current.ip} ${liveReason}` : `ban-ip ${current.ip}`);
  }

  return readBans(serverId);
}

export async function removeIpBan(
  serverId: string,
  _dir: string,
  ip: string,
): Promise<BansResponse> {
  const list = (await readJsonArray<IpBanEntry>(serverId, "banned-ips.json"))
    .map(normalizeIpBan)
    .filter((e): e is IpBanEntry => e !== null);
  const next = list.filter((e) => e.ip !== ip);
  if (next.length === list.length) {
    throw new Error(`${ip} is not banned`);
  }
  await writeJsonArray(serverId, "banned-ips.json", next);
  runLive(serverId, `pardon-ip ${ip}`);
  return readBans(serverId);
}
