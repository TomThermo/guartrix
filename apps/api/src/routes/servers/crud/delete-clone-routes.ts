import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { primaryAllocationProtocol } from "@msm/shared";
import { safeExtractArchive } from "@msm/node-agent";
import {
  assertAdminFullApiKey,
  requireServerAccess,
  verifyAccountPassword,
} from "../../../auth/auth.js";
import { logActivity } from "../../../activity-log.js";
import { prisma } from "../../../db.js";
import { destroyServerDatabases } from "../databases.js";
import { openFirewallPort } from "../../../nodes/firewall.js";
import { processManager } from "../../../servers/process-manager.js";
import { updateServerProperties } from "../../../servers/properties.js";
import { syncLocalDirToNode, wipeServerEverywhere } from "../../../servers/server-files.js";
import { serverListInclude, toMcServer } from "../../../servers/serialize.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cloneSchema } from "./schemas.js";

export function registerServerDeleteCloneRoutes(app: FastifyInstance): void {
  app.delete<{ Params: { id: string }; Body: { password?: string } }>(
    "/api/servers/:id",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      const server = access.server;

      const password = typeof request.body?.password === "string" ? request.body.password : "";
      if (!password) {
        return reply.status(400).send({ error: "Password is required to delete this server" });
      }
      if (!(await verifyAccountPassword(request, password))) {
        return reply.status(403).send({ error: "Incorrect password" });
      }

      if (server.status === "TRANSFERRING" || server.status === "CREATING") {
        return reply
          .status(409)
          .send({ error: "Server is busy — wait for the current operation to finish" });
      }

      if (processManager.isRunning(server.id)) {
        await processManager.stop(server.id);
      }

      const subdomain = server.subdomain;
      const nodeId = server.nodeId;
      const { closeServerAllocationFirewalls, releaseServerAllocations } = await import(
        "../../../servers/allocations.js"
      );
      await closeServerAllocationFirewalls(server.id, nodeId).catch(() => undefined);
      await destroyServerDatabases(server.id).catch(() => undefined);
      await wipeServerEverywhere(server.id).catch(() => undefined);
      await releaseServerAllocations(server.id).catch(() => undefined);
      await prisma.server.delete({ where: { id: server.id } });
      logActivity({
        action: "server.delete",
        request,
        user: access.user,
        serverId: null,
        serverName: server.name,
        metadata: { serverId: server.id, port: server.port, node: nodeId },
      });
      try {
        const { deleteServerSubdomain } = await import("../../../nodes/cloudflare-dns.js");
        await deleteServerSubdomain(subdomain);
      } catch (dnsErr) {
        const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
        console.warn(`[guartrix] Cloudflare subdomain cleanup failed: ${msg}`);
      }
      return reply.status(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/servers/:id/clone",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        ownerOnly: true,
      });
      if (!access) return;
      const source = access.server;
      const parsed = cloneSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      if (processManager.isRunning(source.id)) {
        return reply.status(409).send({ error: "Stop the server before cloning" });
      }
      if (access.user.role === "VIEWER") {
        return reply.status(403).send({ error: "Viewers cannot clone servers" });
      }
      if (parsed.data.nodeId && access.user.role !== "ADMIN") {
        return reply.status(403).send({ error: "Only admins can choose a node" });
      }
      if (
        parsed.data.nodeId &&
        access.user.role === "ADMIN" &&
        !assertAdminFullApiKey(request, reply)
      ) {
        return;
      }
      const memoryMb = parsed.data.memoryMb ?? source.memoryMb;
      const diskMb = parsed.data.diskMb ?? source.diskMb;
      try {
        const { assertCanCreateServer } = await import("../../../billing/quotas.js");
        await assertCanCreateServer(access.user, memoryMb, { diskMb });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(403).send({ error: message });
      }

      let nodeId: string;
      try {
        const { assertNodeCapacity, resolveCreateNodeId } = await import("../../../nodes/nodes.js");
        nodeId = await resolveCreateNodeId(
          access.user.role === "ADMIN" ? (parsed.data.nodeId ?? source.nodeId) : source.nodeId,
        );
        await assertNodeCapacity(nodeId, memoryMb, {
          placement: true,
          diskMb,
          cpuLimit: parsed.data.cpuLimit ?? source.cpuLimit,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }

      const protocol = primaryAllocationProtocol(source.type);
      const free = await processManager.isPortFree(parsed.data.port, undefined, nodeId, protocol);
      if (!free) {
        return reply.status(409).send({
          error: `Port ${parsed.data.port}/${protocol} is already in use`,
        });
      }

      const id = nanoid(12);
      const destNode = await prisma.node.findUnique({ where: { id: nodeId } });
      if (!destNode) {
        return reply.status(400).send({ error: "Node not found" });
      }

      await prisma.server.create({
        data: {
          id,
          name: parsed.data.name,
          type: source.type,
          mcVersion: source.mcVersion,
          port: parsed.data.port,
          memoryMb,
          diskMb: parsed.data.diskMb ?? source.diskMb,
          cpuLimit: parsed.data.cpuLimit ?? source.cpuLimit,
          status: "CREATING",
          javaPath: source.javaPath,
          startupCommand: source.startupCommand,
          serverJar: source.serverJar,
          fabricLoaderVersion: source.fabricLoaderVersion,
          forgeVersion: source.forgeVersion,
          paperBuild: source.paperBuild,
          autoRestart: source.autoRestart,
          startOnBoot: true,
          ownerId: access.user.id,
          nodeId,
          extraMounts: source.extraMounts ?? undefined,
        },
      });

      const staging = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-clone-${id}-`));
      const { tryEnsureServerSubdomain, cleanupFailedProvision, autoStartProvisionedServer } =
        await import("../../../servers/server-provision.js");
      try {
        await openFirewallPort(parsed.data.port, nodeId, protocol);
        const { ensurePrimaryAllocation } = await import("../../../servers/allocations.js");
        await ensurePrimaryAllocation({
          serverId: id,
          nodeId,
          port: parsed.data.port,
          protocol,
        });

        // Pull source files via daemon export (stream to disk — avoid OOM on large worlds)
        const archivePath = path.join(staging, "source.tar.gz");
        const { daemonExportArchiveToFile } = await import("../../../nodes/daemon-client.js");
        await daemonExportArchiveToFile(source.id, archivePath);
        await safeExtractArchive(archivePath, staging);
        await fs.rm(archivePath, { force: true });
        await fs
          .rm(path.join(staging, "logs"), { recursive: true, force: true })
          .catch(() => undefined);
        await fs
          .rm(path.join(staging, "crash-reports"), { recursive: true, force: true })
          .catch(() => undefined);
        await fs.rm(path.join(staging, "session.lock"), { force: true }).catch(() => undefined);

        await syncLocalDirToNode(id, nodeId, staging);
        await updateServerProperties(id, {}, parsed.data.port);

        const subdomain = await tryEnsureServerSubdomain(parsed.data.name, parsed.data.port);

        const updated = await prisma.server.update({
          where: { id },
          data: { status: "STOPPED", errorMessage: null, subdomain },
          include: serverListInclude,
        });
        logActivity({
          action: "server.clone",
          request,
          user: access.user,
          server: updated,
          metadata: {
            clonedFrom: source.name,
            sourceId: source.id,
            port: updated.port,
            node: nodeId,
          },
        });
        await autoStartProvisionedServer(updated.id);
        const refreshed = await prisma.server.findUniqueOrThrow({
          where: { id: updated.id },
          include: serverListInclude,
        });
        return reply.status(201).send(toMcServer(refreshed));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logActivity({
          action: "server.clone",
          request,
          user: access.user,
          server: source,
          success: false,
          metadata: { error: message, name: parsed.data.name },
        });
        await cleanupFailedProvision(id, parsed.data.port, nodeId, protocol);
        return reply.status(500).send({ error: message });
      } finally {
        await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  );
}
