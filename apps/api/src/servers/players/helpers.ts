import type { PlayerEntry, ServerType } from "@guartrix/shared";
import {
  parseBdsAllowlistJson,
  parseBdsPermissionsJson,
  serializeBdsAllowlist,
  serializeBdsPermissions,
  type BdsAllowlistEntry,
  type BdsPermissionEntry,
} from "@guartrix/shared";
import { daemonReadFile, daemonWriteFile } from "../../nodes/daemon-client.js";
import { prisma } from "../../db.js";
import { processManager } from "../process-manager.js";

interface MojangProfile {
  id: string;
  name: string;
}

function formatUuid(id: string): string {
  const hex = id.replace(/-/g, "").toLowerCase();
  if (hex.length !== 32) return id;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function banTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`;
}

export async function readJsonArray<T>(serverId: string, rel: string): Promise<T[]> {
  try {
    const res = (await daemonReadFile(serverId, rel)) as { content?: string };
    const data = JSON.parse(res.content ?? "[]") as unknown;
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

export async function writeJsonArray(
  serverId: string,
  rel: string,
  data: unknown[],
): Promise<void> {
  await daemonWriteFile(serverId, rel, `${JSON.stringify(data, null, 2)}\n`);
}

export async function serverTypeFor(serverId: string): Promise<ServerType> {
  const row = await prisma.server.findUnique({
    where: { id: serverId },
    select: { type: true },
  });
  return (row?.type ?? "VANILLA") as ServerType;
}

export async function readBdsOpsAsPanelEntries(serverId: string): Promise<
  {
    name?: string;
    uuid?: string;
    level?: number;
    bypassesPlayerLimit?: boolean;
  }[]
> {
  const allowlist = await readBdsAllowlistEntries(serverId);
  const xuidToName = new Map(
    allowlist.filter((e) => e.xuid).map((e) => [e.xuid!, e.name] as const),
  );
  const perms = await readBdsPermissions(serverId);
  return perms
    .filter((p) => p.permission === "operator")
    .map((p) => ({
      name: xuidToName.get(p.xuid) ?? `xuid:${p.xuid}`,
      uuid: p.xuid,
      level: 4,
      bypassesPlayerLimit: false,
    }));
}

export async function readBdsAllowlistEntries(serverId: string): Promise<BdsAllowlistEntry[]> {
  try {
    const res = (await daemonReadFile(serverId, "allowlist.json")) as {
      content?: string;
    };
    return parseBdsAllowlistJson(res.content ?? "[]");
  } catch {
    return [];
  }
}

export async function writeBdsAllowlistEntries(
  serverId: string,
  entries: BdsAllowlistEntry[],
): Promise<void> {
  await daemonWriteFile(serverId, "allowlist.json", serializeBdsAllowlist(entries));
}

export async function readBdsPermissions(serverId: string): Promise<BdsPermissionEntry[]> {
  try {
    const res = (await daemonReadFile(serverId, "permissions.json")) as {
      content?: string;
    };
    return parseBdsPermissionsJson(res.content ?? "[]");
  } catch {
    return [];
  }
}

export async function writeBdsPermissions(
  serverId: string,
  entries: BdsPermissionEntry[],
): Promise<void> {
  await daemonWriteFile(serverId, "permissions.json", serializeBdsPermissions(entries));
}

export function runBdsAllowlistReload(serverId: string): void {
  runLive(serverId, "allowlist reload");
}

export function runBdsPermissionReload(serverId: string): void {
  runLive(serverId, "permission reload");
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

export function runLive(serverId: string, command: string): void {
  if (!processManager.isRunning(serverId)) return;
  try {
    processManager.sendCommand(serverId, command);
  } catch {
    // best-effort while running
  }
}
