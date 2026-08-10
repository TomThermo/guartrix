import type { FastifyInstance } from "fastify";
import { logActivity } from "../../activity-log.js";
import { requireAdmin } from "../../auth/auth.js";
import { daemonGetStatus, daemonTestNode, setNodeToken } from "../../nodes/daemon-client.js";
import {
  generateDaemonToken,
  hashDaemonToken,
  nodePublicUrl,
  syncNodeSftpDns,
  writeLocalDaemonEnvIfLocal,
} from "../../nodes/nodes.js";
import { serializeNodeWithUsage } from "../../services/nodes-list-serialize.js";
import { findNode, updateNode } from "../../repositories/nodes.js";

export function registerNodeAdminStatusRoutes(app: FastifyInstance): void {
  /** Live host snapshot for one node (Overview modal polling). */
  app.get<{ Params: { id: string } }>("/api/admin/nodes/:id/status", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "nodes.read"))) return;
    const existing = await findNode({
      where: { id: request.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const publicUrl = nodePublicUrl(existing);
    try {
      const snapshot = await daemonGetStatus(existing.id);
      await updateNode({
        where: { id: existing.id },
        data: {
          status: "ONLINE",
          lastSeenAt: new Date(),
          memoryMb: snapshot.totalMemoryMb,
        },
      });
      return {
        id: existing.id,
        name: existing.name,
        isLocal: existing.isLocal,
        publicUrl,
        reachable: true as const,
        daemon: {
          hostname: snapshot.hostname,
          publicIp: snapshot.publicIp,
          localIps: snapshot.localIps,
          osVersion: snapshot.osVersion,
          arch: snapshot.arch,
          cpuCount: snapshot.cpuCount,
          loadAvg: snapshot.loadAvg,
          dockerVersion: snapshot.dockerVersion,
          daemonVersion: snapshot.daemonVersion,
          daemonPid: snapshot.daemonPid,
          daemonPort: snapshot.daemonPort,
          daemonMemoryRssMb: snapshot.daemonMemoryRssMb,
          uptime: snapshot.uptime,
          totalMemoryMb: snapshot.totalMemoryMb,
          totalMemoryGb: snapshot.totalMemoryGb,
          freeMemoryMb: snapshot.freeMemoryMb,
          disk: snapshot.disk,
          network: snapshot.network ?? null,
        },
        mysql: snapshot.mysql,
        sftp: {
          listening: Boolean(snapshot.sftp?.listening),
          port: snapshot.sftp?.port ?? existing.sftpPort ?? 2022,
          hostname: existing.sftpHostname ?? null,
        },
        generatedAt: new Date().toISOString(),
      };
    } catch (err) {
      await updateNode({
        where: { id: existing.id },
        data: { status: "OFFLINE" },
      });
      return {
        id: existing.id,
        name: existing.name,
        isLocal: existing.isLocal,
        publicUrl,
        reachable: false as const,
        error: err instanceof Error ? err.message : String(err),
        generatedAt: new Date().toISOString(),
      };
    }
  });

  app.post<{ Params: { id: string } }>("/api/admin/nodes/:id/test", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "nodes.write"))) return;
    const existing = await findNode({
      where: { id: request.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const result = await daemonTestNode(request.params.id);
    if (result.ok) {
      await syncNodeSftpDns(request.params.id, result.system.publicIp);
    }
    return {
      ...result,
      node: await serializeNodeWithUsage(request.params.id),
    };
  });

  app.post<{ Params: { id: string } }>(
    "/api/admin/nodes/:id/regenerate-token",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const existing = await findNode({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const token = generateDaemonToken();
      const node = await updateNode({
        where: { id: existing.id },
        data: { tokenHash: hashDaemonToken(token) },
      });
      setNodeToken(node.id, token);
      if (node.isLocal) {
        writeLocalDaemonEnvIfLocal(token, node.daemonPort, node.id);
      }
      logActivity({
        action: "node.token-rotate",
        request,
        user: admin,
        metadata: { node: node.name },
      });
      return {
        node: await serializeNodeWithUsage(node.id),
        token,
      };
    },
  );
}
