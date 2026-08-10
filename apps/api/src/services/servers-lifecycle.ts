import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyRequest } from "fastify";
import type { Server } from "@prisma/client";
import type { AuthUser } from "@guartrix/shared";
import { primaryAllocationProtocol } from "@guartrix/shared";
import { nanoid } from "nanoid";
import type { z } from "zod";
import { logActivity } from "../activity-log.js";
import { verifyAccountPassword } from "../auth/auth.js";
import { openFirewallPort } from "../nodes/firewall.js";
import { daemonExportArchiveToFile } from "../nodes/daemon-client.js";
import { safeExtractArchive } from "@guartrix/node-agent";
import { assertCanCreateServer } from "../billing/quotas.js";
import { assertNodeCapacity, resolveCreateNodeId } from "../nodes/nodes.js";
import { processManager } from "../servers/process-manager.js";
import { updateServerProperties } from "../servers/properties.js";
import {
  autoStartProvisionedServer,
  cleanupFailedProvision,
  tryEnsureServerSubdomain,
} from "../servers/server-provision.js";
import { syncLocalDirToNode, wipeServerEverywhere } from "../servers/server-files.js";
import { serverListInclude, toMcServer } from "../servers/serialize.js";
import { closeServerAllocationFirewalls, releaseServerAllocations } from "../servers/allocations.js";
import { cloneServerSchema } from "../schemas/servers.js";
import { findNode } from "./nodes.js";
import { createServer, deleteServer, findServerOrThrow, updateServer } from "./servers.js";
import { destroyServerDatabases } from "./server-databases.js";

export type CloneServerInput = z.infer<typeof cloneServerSchema>;

export async function deleteOwnedServer(
  server: Server,
  user: AuthUser,
  request: FastifyRequest,
  password: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!password) {
    return { ok: false, status: 400, error: "Password is required to delete this server" };
  }
  if (!(await verifyAccountPassword(request, password))) {
    return { ok: false, status: 403, error: "Incorrect password" };
  }
  if (server.status === "TRANSFERRING" || server.status === "CREATING") {
    return {
      ok: false,
      status: 409,
      error: "Server is busy — wait for the current operation to finish",
    };
  }

  if (processManager.isRunning(server.id)) {
    await processManager.stop(server.id);
  }

  const subdomain = server.subdomain;
  const nodeId = server.nodeId;
  await closeServerAllocationFirewalls(server.id, nodeId).catch(() => undefined);
  await destroyServerDatabases(server.id).catch(() => undefined);
  await wipeServerEverywhere(server.id).catch(() => undefined);
  await releaseServerAllocations(server.id).catch(() => undefined);
  await deleteServer({ where: { id: server.id } });
  logActivity({
    action: "server.delete",
    request,
    user,
    serverId: null,
    serverName: server.name,
    metadata: { serverId: server.id, port: server.port, node: nodeId },
  });
  try {
    const { deleteServerSubdomain } = await import("../nodes/cloudflare-dns.js");
    await deleteServerSubdomain(subdomain);
  } catch (dnsErr) {
    const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
    console.warn(`[guartrix] Cloudflare subdomain cleanup failed: ${msg}`);
  }
  return { ok: true };
}

export async function cloneServerFromSource(
  source: Server,
  user: AuthUser,
  data: CloneServerInput,
  request: FastifyRequest,
): Promise<
  | { ok: true; body: ReturnType<typeof toMcServer> }
  | { ok: false; status: number; error: string | object }
> {
  if (processManager.isRunning(source.id)) {
    return { ok: false, status: 409, error: "Stop the server before cloning" };
  }
  if (user.role === "VIEWER") {
    return { ok: false, status: 403, error: "Viewers cannot clone servers" };
  }
  if (data.nodeId && user.role !== "ADMIN") {
    return { ok: false, status: 403, error: "Only admins can choose a node" };
  }

  const memoryMb = data.memoryMb ?? source.memoryMb;
  const diskMb = data.diskMb ?? source.diskMb;
  try {
    await assertCanCreateServer(user, memoryMb, { diskMb });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 403, error: message };
  }

  let nodeId: string;
  try {
    nodeId = await resolveCreateNodeId(
      user.role === "ADMIN" ? (data.nodeId ?? source.nodeId) : source.nodeId,
    );
    await assertNodeCapacity(nodeId, memoryMb, {
      placement: true,
      diskMb,
      cpuLimit: data.cpuLimit ?? source.cpuLimit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 400, error: message };
  }

  const protocol = primaryAllocationProtocol(source.type);
  const free = await processManager.isPortFree(data.port, undefined, nodeId, protocol);
  if (!free) {
    return { ok: false, status: 409, error: `Port ${data.port}/${protocol} is already in use` };
  }

  const id = nanoid(12);
  const destNode = await findNode({ where: { id: nodeId } });
  if (!destNode) {
    return { ok: false, status: 400, error: "Node not found" };
  }

  await createServer({
    data: {
      id,
      name: data.name,
      type: source.type,
      mcVersion: source.mcVersion,
      port: data.port,
      memoryMb,
      diskMb: data.diskMb ?? source.diskMb,
      cpuLimit: data.cpuLimit ?? source.cpuLimit,
      status: "CREATING",
      javaPath: source.javaPath,
      startupCommand: source.startupCommand,
      serverJar: source.serverJar,
      fabricLoaderVersion: source.fabricLoaderVersion,
      forgeVersion: source.forgeVersion,
      paperBuild: source.paperBuild,
      autoRestart: source.autoRestart,
      startOnBoot: true,
      ownerId: user.id,
      nodeId,
      extraMounts: source.extraMounts ?? undefined,
    },
  });

  const staging = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-clone-${id}-`));
  try {
    await openFirewallPort(data.port, nodeId, protocol);
    const { ensurePrimaryAllocation } = await import("../servers/allocations.js");
    await ensurePrimaryAllocation({
      serverId: id,
      nodeId,
      port: data.port,
      protocol,
    });

    const archivePath = path.join(staging, "source.tar.gz");
    await daemonExportArchiveToFile(source.id, archivePath);
    await safeExtractArchive(archivePath, staging);
    await fs.rm(archivePath, { force: true });
    await fs.rm(path.join(staging, "logs"), { recursive: true, force: true }).catch(() => undefined);
    await fs
      .rm(path.join(staging, "crash-reports"), { recursive: true, force: true })
      .catch(() => undefined);
    await fs.rm(path.join(staging, "session.lock"), { force: true }).catch(() => undefined);

    await syncLocalDirToNode(id, nodeId, staging);
    await updateServerProperties(id, {}, data.port);

    const subdomain = await tryEnsureServerSubdomain(data.name, data.port);

    const updated = await updateServer({
      where: { id },
      data: { status: "STOPPED", errorMessage: null, subdomain },
      include: serverListInclude,
    });
    logActivity({
      action: "server.clone",
      request,
      user,
      server: updated,
      metadata: {
        clonedFrom: source.name,
        sourceId: source.id,
        port: updated.port,
        node: nodeId,
      },
    });
    await autoStartProvisionedServer(updated.id);
    const refreshed = await findServerOrThrow({
      where: { id: updated.id },
      include: serverListInclude,
    });
    return { ok: true, body: toMcServer(refreshed) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logActivity({
      action: "server.clone",
      request,
      user,
      server: source,
      success: false,
      metadata: { error: message, name: data.name },
    });
    await cleanupFailedProvision(id, data.port, nodeId, protocol);
    return { ok: false, status: 500, error: message };
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
  }
}
