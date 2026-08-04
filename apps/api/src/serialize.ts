import { readFileSync } from "node:fs";
import path from "node:path";
import type { Node, Server, User } from "@prisma/client";
import type {
  McServer,
  PlayersResponse,
  ServerDetail,
  ServerProperties,
} from "@msm/shared";
import { DEFAULT_SERVER_JAR, normalizeJavaVersion } from "@msm/shared";
import { serverDir } from "./config.js";
import { coerceExtraMounts } from "./extra-mounts.js";
import { hasServerIcon } from "./server-icon.js";

type ServerWithRelations = Server & {
  owner?: Pick<User, "id" | "username"> | null;
  node?: Pick<Node, "id" | "name"> | null;
};

function readWhitelistEnabled(serverId: string): boolean {
  try {
    const raw = readFileSync(path.join(serverDir(serverId), "server.properties"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith("white-list="));
    if (!line) return false;
    return line.slice("white-list=".length).trim() === "true";
  } catch {
    return false;
  }
}

export const serverListInclude = {
  owner: { select: { id: true, username: true } },
  node: { select: { id: true, name: true } },
} as const;

export function toMcServer(server: ServerWithRelations): McServer {
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
    serverJar: server.serverJar?.trim() || DEFAULT_SERVER_JAR,
    javaPath: server.javaPath,
    fabricLoaderVersion: server.fabricLoaderVersion,
    forgeVersion: server.forgeVersion,
    paperBuild: server.paperBuild,
    errorMessage: server.errorMessage,
    hasIcon: hasServerIcon(server.id),
    whitelistEnabled: readWhitelistEnabled(server.id),
    autoRestart: server.autoRestart,
    startOnBoot: server.startOnBoot,
    stoppedByUser: server.stoppedByUser,
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
  const { prisma } = await import("./db.js");
  return prisma.server.findUnique({
    where: { id },
    include: serverListInclude,
  });
}
