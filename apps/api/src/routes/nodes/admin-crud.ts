import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { logActivity } from "../../activity-log.js";
import { requireAdmin } from "../../auth/auth.js";
import { clearNodeToken, setNodeToken } from "../../nodes/daemon-client.js";
import {
  generateDaemonToken,
  hashDaemonToken,
  removeNodeSftpDns,
  syncNodeSftpDns,
} from "../../nodes/nodes.js";
import { createSchema, updateSchema } from "./schemas.js";
import { serializeNodeWithUsage } from "../../services/nodes-list-serialize.js";
import { createNode, deleteNode, findNode, updateNode } from "../../services/nodes.js";

export function registerNodeAdminCrudRoutes(app: FastifyInstance): void {
  app.post("/api/admin/nodes", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const { assertLicenseNodeQuota } = await import("../../license/license.js");
      await assertLicenseNodeQuota();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      return reply.status(403).send({
        error: message,
        code: code || "LICENSE_QUOTA",
      });
    }
    const token = generateDaemonToken();
    const sftpPort = Number(process.env.SFTP_PORT ?? 2022) || 2022;
    const location = parsed.data.location ?? null;
    const node = await createNode({
      data: {
        id: nanoid(12),
        name: parsed.data.name,
        fqdn: parsed.data.fqdn,
        scheme: parsed.data.scheme,
        daemonPort: parsed.data.daemonPort,
        behindProxy: parsed.data.behindProxy,
        memoryMb: parsed.data.memoryMb,
        location,
        tokenHash: hashDaemonToken(token),
        isLocal: false,
        status: "UNKNOWN",
        sftpPort,
      },
    });
    setNodeToken(node.id, token);
    await syncNodeSftpDns(node.id);
    logActivity({
      action: "node.create",
      request,
      user: admin,
      metadata: {
        node: node.name,
        fqdn: node.fqdn,
        daemonPort: node.daemonPort,
        memoryMb: node.memoryMb,
      },
    });
    return {
      node: await serializeNodeWithUsage(node.id),
      token,
    };
  });

  app.patch<{ Params: { id: string } }>("/api/admin/nodes/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const existing = await findNode({
      where: { id: request.params.id },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.location !== undefined) {
      data.location = parsed.data.location;
    }
    if (parsed.data.sftpAlias !== undefined) {
      data.sftpAlias = parsed.data.sftpAlias;
    }
    if (parsed.data.tags !== undefined) {
      data.tags = parsed.data.tags;
    }
    if (parsed.data.daemonBaseDirectory !== undefined) {
      const dir = parsed.data.daemonBaseDirectory.trim();
      if (!dir.startsWith("/")) {
        return reply.status(400).send({ error: "Daemon base directory must be an absolute path" });
      }
      data.daemonBaseDirectory = dir.replace(/\/+$/, "") || "/var/lib/guartrix";
    }
    await updateNode({
      where: { id: request.params.id },
      data,
    });
    if (parsed.data.name || parsed.data.fqdn || parsed.data.sftpPort !== undefined) {
      await syncNodeSftpDns(request.params.id);
    }
    // Local daemon bind port comes from env DAEMON_PORT (daemon.env), not from
    // node.daemonPort (which may be the public HTTPS port behind prod-web).
    logActivity({
      action: "node.update",
      request,
      user: admin,
      metadata: { node: existing.name, fields: Object.keys(parsed.data) },
    });
    return { node: await serializeNodeWithUsage(request.params.id) };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/nodes/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const existing = await findNode({
      where: { id: request.params.id },
      include: { _count: { select: { servers: true } } },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    if (existing.isLocal) {
      return reply.status(400).send({ error: "Cannot delete the local node" });
    }
    if (existing._count.servers > 0) {
      return reply.status(400).send({ error: "Node still has servers assigned" });
    }
    await removeNodeSftpDns(request.params.id);
    await deleteNode({ where: { id: request.params.id } });
    clearNodeToken(request.params.id);
    logActivity({
      action: "node.delete",
      request,
      user: admin,
      metadata: { node: existing.name, fqdn: existing.fqdn },
    });
    return { ok: true };
  });
}
