import { readFileSync } from "node:fs";
import path from "node:path";
import type { Node, Server, User } from "@prisma/client";
import type { McServer, PlayersResponse, ServerDetail, ServerProperties, ServerType } from "@msm/shared";
import { defaultServerExecutable, isBdsServerType, normalizeJavaVersion } from "@msm/shared";
import { serverDir } from "../config.js";
import { coerceExtraMounts } from "./extra-mounts.js";
import { hasServerIcon } from "./server-icon.js";

type ServerWithRelations = Server & {
  owner?: Pick<User, "id" | "username"> | null;
  node?: Pick<Node, "id" | "name"> | null;
};

type FsMeta = { hasIcon: boolean; whitelistEnabled: boolean; expiresAt: number };

const fsMetaCache = new Map<string, FsMeta>();

function listFsMetaTtlMs(): number {
  // default 15000; clamp 1s–2m
  const n = Number(process.env.SERVER_LIST_FS_CACHE_MS ?? 15_000);
  if (!Number.isFinite(n)) return 15_000;
  return Math.min(120_000, Math.max(1_000, Math.trunc(n)));
}

function readWhitelistEnabled(serverId: string, type?: ServerType): boolean {
  try {
    const raw = readFileSync(path.join(serverDir(serverId), "server.properties"), "utf8");
    const key =
      type && isBdsServerType(type) ? "allow-list=" : "white-list=";
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(key));
    if (!line) return false;
    return line.slice(key.length).trim() === "true";
  } catch {
    return false;
  }
}

function getListFsMeta(serverId: string, type?: ServerType): Omit<FsMeta, "expiresAt"> {
  const now = Date.now();
  const hit = fsMetaCache.get(serverId);
  if (hit && hit.expiresAt > now) {
    return { hasIcon: hit.hasIcon, whitelistEnabled: hit.whitelistEnabled };
  }
  const meta = {
    hasIcon: hasServerIcon(serverId),
    whitelistEnabled: readWhitelistEnabled(serverId, type),
  };
  fsMetaCache.set(serverId, { ...meta, expiresAt: now + listFsMetaTtlMs() });
  return meta;
}

/** Drop cached icon/whitelist flags after mutations (icon upload, properties write). */
export function invalidateServerListFsMeta(serverId: string): void {
  fsMetaCache.delete(serverId);
}

export const serverListInclude = {
  owner: { select: { id: true, username: true } },
  node: { select: { id: true, name: true } },
} as const;

export function toMcServer(server: ServerWithRelations): McServer {
  const fsMeta = getListFsMeta(server.id, server.type as ServerType);
  return {
    id: server.id,
    name: server.name,
    type: server.type,
    mcVersion: server.mcVersion,
    port: server.port,
    memoryMb: server.memoryMb,
    diskMb: server.diskMb ?? 10_240,
    cpuLimit: server.cpuLimit ?? 0,
    status: server.status,
    javaVersion: normalizeJavaVersion(server.javaPath),
    startupCommand: server.startupCommand ?? null,
    serverJar:
      server.serverJar?.trim() ||
      defaultServerExecutable(server.type as ServerType),
    fabricLoaderVersion: server.fabricLoaderVersion,
    forgeVersion: server.forgeVersion,
    paperBuild: server.paperBuild,
    errorMessage: server.errorMessage,
    hasIcon: fsMeta.hasIcon,
    whitelistEnabled: fsMeta.whitelistEnabled,
    autoRestart: server.autoRestart,
    startOnBoot: server.startOnBoot,
    stoppedByUser: server.stoppedByUser,
    suspended: server.suspended ?? false,
    ownerAlertWebhookUrl: server.ownerAlertWebhookUrl ?? null,
    ownerAlertEmail: server.ownerAlertEmail ?? null,
    discordStatusWebhookUrl: server.discordStatusWebhookUrl ?? null,
    discordStatusEnabled: server.discordStatusEnabled ?? false,
    bluemapUrl: server.bluemapUrl ?? null,
    ownerId: server.ownerId ?? null,
    ownerUsername: server.owner?.username ?? null,
    nodeId: server.nodeId ?? server.node?.id ?? null,
    nodeName: server.node?.name ?? null,
    subdomain: server.subdomain ?? null,
    extraMounts: coerceExtraMounts(server.extraMounts),
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
  };
}

export function toServerDetail(
  server: ServerWithRelations,
  properties: ServerProperties,
  players: PlayersResponse,
): ServerDetail {
  return { ...toMcServer(server), properties, players };
}

export async function loadServerWithOwner(id: string): Promise<ServerWithRelations | null> {
  const { prisma } = await import("../db.js");
  return prisma.server.findUnique({
    where: { id },
    include: serverListInclude,
  });
}
