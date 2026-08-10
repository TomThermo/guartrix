import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { hasPermission } from "@guartrix/shared";
import { logActivity } from "../../../activity-log.js";
import { requireServerAccess } from "../../../auth/auth.js";
import {
  ensurePrimaryAllocation,
  ensureUdpCompanion,
  serializeAllocation,
} from "../../../servers/allocations.js";
import { openFirewallPort } from "../../../nodes/firewall.js";
import { processManager } from "../../../servers/process-manager.js";
import { assignSchema } from "./schemas.js";
import { type AllocationWithServerName, createAllocation, findAllocation, findManyAllocations, updateAllocation } from "../../../repositories/allocations.js";
import { findFirstServer } from "../../../repositories/servers.js";

export function registerAllocationListCreateRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/allocations", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "allocation.read",
    });
    if (!access) return;

    if (access.server.nodeId) {
      await ensurePrimaryAllocation({
        serverId: access.server.id,
        nodeId: access.server.nodeId,
        port: access.server.port,
      }).catch(() => undefined);
    }

    const rows = await findManyAllocations({
      where: { serverId: access.server.id },
      include: { server: { select: { name: true } } },
      orderBy: [{ isPrimary: "desc" }, { port: "asc" }],
    });

    const canCreate = hasPermission(access.permissions, "allocation.create");
    const free =
      canCreate && access.server.nodeId
        ? await findManyAllocations({
            where: { nodeId: access.server.nodeId, serverId: null },
            include: { server: { select: { name: true } } },
            orderBy: { port: "asc" },
            take: 200,
          })
        : [];

    return {
      allocations: rows.map(serializeAllocation),
      free: free.map(serializeAllocation),
    };
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/allocations", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "allocation.create",
    });
    if (!access) return;
    const parsed = assignSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    if (!access.server.nodeId) {
      return reply.status(400).send({ error: "Server has no node assigned" });
    }
    const nodeId = access.server.nodeId;

    let row: AllocationWithServerName;
    if (parsed.data.allocationId) {
      const found = await findAllocation({
        where: { id: parsed.data.allocationId },
      });
      if (!found || found.nodeId !== nodeId) {
        return reply.status(404).send({ error: "Allocation not found on this node" });
      }
      if (found.serverId) {
        return reply.status(409).send({ error: "Allocation is already assigned" });
      }
      row = await updateAllocation({
        where: { id: found.id },
        data: {
          serverId: access.server.id,
          isPrimary: false,
          notes: parsed.data.notes ?? found.notes,
        },
        include: { server: { select: { name: true } } },
      });
    } else {
      const port = parsed.data.port!;
      const protocol = parsed.data.protocol;
      const existing = await findAllocation({
        where: {
          nodeId_port_protocol: { nodeId, port, protocol },
        },
      });
      if (existing?.serverId) {
        return reply.status(409).send({ error: `Port ${port}/${protocol} is already allocated` });
      }
      if (protocol === "tcp") {
        const serverClash = await findFirstServer({
          where: {
            nodeId,
            port,
            NOT: { id: access.server.id },
          },
        });
        if (serverClash) {
          return reply
            .status(409)
            .send({ error: `Port ${port} is already used by another server` });
        }
      }
      const freeOnHost = await processManager.isPortFree(port, access.server.id, nodeId, protocol);
      if (!freeOnHost) {
        return reply.status(409).send({ error: `Port ${port} is already in use on the host` });
      }

      if (existing) {
        row = await updateAllocation({
          where: { id: existing.id },
          data: {
            serverId: access.server.id,
            isPrimary: false,
            notes: parsed.data.notes ?? existing.notes,
          },
          include: { server: { select: { name: true } } },
        });
      } else {
        row = await createAllocation({
          data: {
            id: nanoid(12),
            nodeId,
            port,
            protocol,
            ip: "0.0.0.0",
            notes: parsed.data.notes ?? null,
            serverId: access.server.id,
            isPrimary: false,
          },
          include: { server: { select: { name: true } } },
        });
      }
    }

    await openFirewallPort(row.port, nodeId, row.protocol === "udp" ? "udp" : "tcp").catch(
      () => undefined,
    );

    if (parsed.data.alsoUdp && row.protocol === "tcp") {
      await ensureUdpCompanion({
        serverId: access.server.id,
        nodeId,
        port: row.port,
        notes: parsed.data.notes,
      }).catch(() => undefined);
    }

    logActivity({
      action: "allocation.assign",
      request,
      user: access.user,
      server: access.server,
      metadata: {
        port: row.port,
        protocol: row.protocol,
        notes: row.notes,
        alsoUdp: Boolean(parsed.data.alsoUdp),
      },
    });

    return reply.status(201).send({ allocation: serializeAllocation(row) });
  });
}
