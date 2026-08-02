import type {
  BanEntry,
  BansResponse,
  IpBanEntry,
  OpEntry,
  PlayerEntry,
  PlayersResponse,
} from "@msm/shared";
import { daemonReadFile, daemonWriteFile } from "./daemon-client.js";
import { processManager } from "./process-manager.js";

interface MojangProfile {
  id: string;
  name: string;
}

function formatUuid(id: string): string {
  const hex = id.replace(/-/g, "").toLowerCase();
  if (hex.length !== 32) return id;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function banTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
}

async function readJsonArray<T>(serverId: string, rel: string): Promise<T[]> {
  try {
    const res = (await daemonReadFile(serverId, rel)) as { content?: string };
    const data = JSON.parse(res.content ?? "[]") as unknown;
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

async function writeJsonArray(
  serverId: string,
  rel: string,
  data: unknown[],
): Promise<void> {
  await daemonWriteFile(serverId, rel, JSON.stringify(data, null, 2) + "\n");
}

export async function resolvePlayer(name: string): Promise<PlayerEntry> {
  const cleaned = name.trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(cleaned)) {
    throw new Error("Invalid Minecraft username");
  }

  const res = await fetch(
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(cleaned)}`,
    { headers: { "User-Agent": "Guartrix/1.0 (contact@localhost)" } },
  );

  if (res.status === 404 || res.status === 204) {
    throw new Error(`Player "${cleaned}" not found on Mojang`);
  }
  if (!res.ok) {
    throw new Error(`Mojang lookup failed (HTTP ${res.status})`);
  }

  const profile = (await res.json()) as MojangProfile;
  return { name: profile.name, uuid: formatUuid(profile.id) };
}

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
    players: playersRaw
      .map(normalizePlayerBan)
      .filter((e): e is BanEntry => e !== null),
    ips: ipsRaw.map(normalizeIpBan).filter((e): e is IpBanEntry => e !== null),
  };
}

export async function readPlayers(serverId: string): Promise<PlayersResponse> {
  const whitelistRaw = await readJsonArray<{ name?: string; uuid?: string }>(
    serverId,
    "whitelist.json",
  );
  const opsRaw = await readJsonArray<{
    name?: string;
    uuid?: string;
    level?: number;
    bypassesPlayerLimit?: boolean;
  }>(serverId, "ops.json");
  const bans = await readBans(serverId);

  return {
    whitelist: whitelistRaw
      .filter((e) => e.name && e.uuid)
      .map((e) => ({ name: e.name!, uuid: e.uuid! })),
    ops: opsRaw
      .filter((e) => e.name && e.uuid)
      .map((e) => ({
        name: e.name!,
        uuid: e.uuid!,
        level: e.level ?? 4,
        bypassesPlayerLimit: Boolean(e.bypassesPlayerLimit),
      })),
    bannedPlayers: bans.players,
  };
}

function runLive(serverId: string, command: string): void {
  if (!processManager.isRunning(serverId)) return;
  try {
    processManager.sendCommand(serverId, command);
  } catch {
    // best-effort while running
  }
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
      patch.reason !== undefined
        ? patch.reason.trim() || "Banned by an operator."
        : current.reason,
    expires:
      patch.expires !== undefined
        ? patch.expires.trim() || "forever"
        : current.expires,
  };
  list[idx] = next;
  await writeJsonArray(serverId, "banned-players.json", list);

  if (processManager.isRunning(serverId)) {
    runLive(serverId, `pardon ${current.name}`);
    const liveReason = next.reason.replace(/[\r\n]+/g, " ").trim();
    runLive(
      serverId,
      liveReason ? `ban ${current.name} ${liveReason}` : `ban ${current.name}`,
    );
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
      patch.reason !== undefined
        ? patch.reason.trim() || "Banned by an operator."
        : current.reason,
    expires:
      patch.expires !== undefined
        ? patch.expires.trim() || "forever"
        : current.expires,
  };
  list[idx] = next;
  await writeJsonArray(serverId, "banned-ips.json", list);

  if (processManager.isRunning(serverId)) {
    runLive(serverId, `pardon-ip ${current.ip}`);
    const liveReason = next.reason.replace(/[\r\n]+/g, " ").trim();
    runLive(
      serverId,
      liveReason ? `ban-ip ${current.ip} ${liveReason}` : `ban-ip ${current.ip}`,
    );
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

export async function addWhitelist(
  serverId: string,
  _dir: string,
  name: string,
): Promise<PlayersResponse> {
  const player = await resolvePlayer(name);
  const list = await readJsonArray<{ name: string; uuid: string }>(
    serverId,
    "whitelist.json",
  );
  if (list.some((e) => e.name.toLowerCase() === player.name.toLowerCase())) {
    throw new Error(`${player.name} is already on the whitelist`);
  }
  list.push({ uuid: player.uuid, name: player.name });
  await writeJsonArray(serverId, "whitelist.json", list);
  runLive(serverId, `whitelist add ${player.name}`);
  return readPlayers(serverId);
}

export async function removeWhitelist(
  serverId: string,
  _dir: string,
  name: string,
): Promise<PlayersResponse> {
  const list = await readJsonArray<{ name: string; uuid: string }>(
    serverId,
    "whitelist.json",
  );
  const next = list.filter((e) => e.name.toLowerCase() !== name.toLowerCase());
  if (next.length === list.length) {
    throw new Error(`${name} is not on the whitelist`);
  }
  await writeJsonArray(serverId, "whitelist.json", next);
  runLive(serverId, `whitelist remove ${name}`);
  return readPlayers(serverId);
}

export async function addOp(
  serverId: string,
  _dir: string,
  name: string,
  level = 4,
): Promise<PlayersResponse> {
  const player = await resolvePlayer(name);
  const list = await readJsonArray<OpEntry>(serverId, "ops.json");
  if (list.some((e) => e.name.toLowerCase() === player.name.toLowerCase())) {
    throw new Error(`${player.name} is already an operator`);
  }
  list.push({
    uuid: player.uuid,
    name: player.name,
    level,
    bypassesPlayerLimit: false,
  });
  await writeJsonArray(serverId, "ops.json", list);
  runLive(serverId, `op ${player.name}`);
  return readPlayers(serverId);
}

export async function removeOp(
  serverId: string,
  _dir: string,
  name: string,
): Promise<PlayersResponse> {
  const list = await readJsonArray<OpEntry>(serverId, "ops.json");
  const next = list.filter((e) => e.name.toLowerCase() !== name.toLowerCase());
  if (next.length === list.length) {
    throw new Error(`${name} is not an operator`);
  }
  await writeJsonArray(serverId, "ops.json", next);
  runLive(serverId, `deop ${name}`);
  return readPlayers(serverId);
}
