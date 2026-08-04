import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import { hasPermission } from "@msm/shared";
import { logActivity } from "../activity-log.js";
import { requireAdmin, requireServerAccess } from "../auth/auth.js";
import {
  createNodeAllocationRange,
  ensurePrimaryAllocation,
  ensureUdpCompanion,
  serializeAllocation,
} from "../servers/allocations.js";
import { changeFirewallPort, closeFirewallPort, openFirewallPort } from "../nodes/firewall.js";
import { prisma } from "../db.js";
import { processManager } from "../servers/process-manager.js";
import { updateServerProperties } from "../servers/properties.js";

const protocolSchema = z.enum(["tcp", "udp"]);

const createRangeSchema = z.object({
  portStart: z.number().int().min(1024).max(65535),
  portEnd: z.number().int().min(1024).max(65535).optional(),
  protocol: protocolSchema.optional().default("tcp"),
  ip: z.string().min(1).max(64).optional(),
  notes: z.string().max(255).optional(),
});

const assignSchema = z
  .object({
    allocationId: z.string().min(1).max(64).optional(),
    port: z.number().int().min(1024).max(65535).optional(),
    protocol: protocolSchema.optional().default("tcp"),
    notes: z.string().max(255).optional(),
    /** Also assign/create UDP on the same port (query / Geyser). */
    alsoUdp: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.allocationId || v.port), {
    message: "allocationId or port is required",
  });

const patchSchema = z.object({
  notes: z.string().max(255).nullable().optional(),
  isPrimary: z.boolean().optional(),
  alsoUdp: z.boolean().optional(),
});

export function registerAllocationRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/allocations",
    async (request, reply) => {
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

      const rows = await prisma.allocation.findMany({
        where: { serverId: access.server.id },
        include: { server: { select: { name: true } } },
        orderBy: [{ isPrimary: "desc" }, { port: "asc" }],
      });

      const canCreate = hasPermission(access.permissions, "allocation.create");
      const free =
        canCreate && access.server.nodeId
          ? await prisma.allocation.findMany({
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
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/servers/:id/allocations",
    async (request, reply) => {
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

      let row;
      if (parsed.data.allocationId) {
        const found = await prisma.allocation.findUnique({
          where: { id: parsed.data.allocationId },
        });
        if (!found || found.nodeId !== nodeId) {
          return reply.status(404).send({ error: "Allocation not found on this node" });
        }
        if (found.serverId) {
          return reply.status(409).send({ error: "Allocation is already assigned" });
        }
        row = await prisma.allocation.update({
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
        const existing = await prisma.allocation.findUnique({
          where: {
            nodeId_port_protocol: { nodeId, port, protocol },
          },
        });
        if (existing?.serverId) {
          return reply
            .status(409)
            .send({ error: `Port ${port}/${protocol} is already allocated` });
        }
        if (protocol === "tcp") {
          const serverClash = await prisma.server.findFirst({
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
        const freeOnHost = await processManager.isPortFree(
          port,
          access.server.id,
          nodeId,
        );
        if (!freeOnHost) {
          return reply
            .status(409)
            .send({ error: `Port ${port} is already in use on the host` });
        }

        if (existing) {
          row = await prisma.allocation.update({
            where: { id: existing.id },
            data: {
              serverId: access.server.id,
              isPrimary: false,
              notes: parsed.data.notes ?? existing.notes,
            },
            include: { server: { select: { name: true } } },
          });
        } else {
          row = await prisma.allocation.create({
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

      await openFirewallPort(
        row.port,
        nodeId,
        row.protocol === "udp" ? "udp" : "tcp",
      ).catch(() => undefined);

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
    },
  );

  app.patch<{ Params: { id: string; allocId: string } }>(
    "/api/servers/:id/allocations/:allocId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "allocation.update",
      });
      if (!access) return;
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const row = await prisma.allocation.findFirst({
        where: { id: request.params.allocId, serverId: access.server.id },
      });
      if (!row) {
        return reply.status(404).send({ error: "Allocation not found" });
      }

      // A server always has exactly one primary allocation (it mirrors
      // Server.port), so the primary can only change by promoting another
      // allocation — never by demoting the current one.
      if (parsed.data.isPrimary === false && row.isPrimary) {
        return reply.status(400).send({
          error:
            "The primary port cannot be demoted — promote another TCP allocation to primary instead",
        });
      }

      if (parsed.data.isPrimary === true && !row.isPrimary) {
        if (
          processManager.isRunning(access.server.id) ||
          access.server.status === "RUNNING"
        ) {
          return reply
            .status(409)
            .send({ error: "Stop the server before changing the primary port" });
        }
        if (row.protocol !== "tcp") {
          return reply
            .status(400)
            .send({ error: "Only TCP allocations can be primary" });
        }
        const oldPort = access.server.port;
        const newPort = row.port;

        await prisma.$transaction([
          prisma.allocation.updateMany({
            where: { serverId: access.server.id, isPrimary: true },
            data: { isPrimary: false },
          }),
          prisma.allocation.update({
            where: { id: row.id },
            data: { isPrimary: true },
          }),
          prisma.server.update({
            where: { id: access.server.id },
            data: { port: newPort },
          }),
        ]);
        await updateServerProperties(access.server.id, {}, newPort);
        try {
          await changeFirewallPort(oldPort, newPort, access.server.nodeId, "tcp");
        } catch (err) {
          await prisma.server.update({
            where: { id: access.server.id },
            data: { port: oldPort },
          });
          await prisma.allocation.updateMany({
            where: { serverId: access.server.id },
            data: { isPrimary: false },
          });
          await prisma.allocation.updateMany({
            where: {
              serverId: access.server.id,
              port: oldPort,
              protocol: "tcp",
            },
            data: { isPrimary: true },
          });
          await updateServerProperties(access.server.id, {}, oldPort);
          const message = err instanceof Error ? err.message : String(err);
          return reply
            .status(500)
            .send({ error: `Firewall update failed: ${message}` });
        }
        logActivity({
          action: "allocation.primary",
          request,
          user: access.user,
          server: access.server,
          metadata: {
            fromPort: oldPort,
            toPort: newPort,
            alsoUdp: Boolean(parsed.data.alsoUdp),
          },
        });
        if (parsed.data.alsoUdp && access.server.nodeId) {
          await ensureUdpCompanion({
            serverId: access.server.id,
            nodeId: access.server.nodeId,
            port: newPort,
          }).catch(() => undefined);
        }
      } else if (parsed.data.notes !== undefined) {
        logActivity({
          action: "allocation.update",
          request,
          user: access.user,
          server: access.server,
          metadata: { port: row.port, protocol: row.protocol },
        });
      }

      const updated = await prisma.allocation.update({
        where: { id: row.id },
        data: {
          notes:
            parsed.data.notes === undefined ? undefined : parsed.data.notes,
        },
        include: { server: { select: { name: true } } },
      });
      return { allocation: serializeAllocation(updated) };
    },
  );

  app.delete<{ Params: { id: string; allocId: string } }>(
    "/api/servers/:id/allocations/:allocId",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "allocation.delete",
      });
      if (!access) return;

      const row = await prisma.allocation.findFirst({
        where: { id: request.params.allocId, serverId: access.server.id },
      });
      if (!row) {
        return reply.status(404).send({ error: "Allocation not found" });
      }
      if (row.isPrimary) {
        return reply.status(400).send({
          error: "Cannot remove the primary allocation — change primary first",
        });
      }

      await prisma.allocation.update({
        where: { id: row.id },
        data: { serverId: null, isPrimary: false },
      });
      await closeFirewallPort(
        row.port,
        access.server.nodeId,
        row.protocol === "udp" ? "udp" : "tcp",
      ).catch(() => undefined);

      logActivity({
        action: "allocation.unassign",
        request,
        user: access.user,
        server: access.server,
        metadata: { port: row.port, protocol: row.protocol },
      });

      return reply.status(204).send();
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/admin/nodes/:id/allocations",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      const node = await prisma.node.findUnique({
        where: { id: request.params.id },
      });
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }
      const rows = await prisma.allocation.findMany({
        where: { nodeId: node.id },
        include: { server: { select: { name: true } } },
        orderBy: [{ port: "asc" }, { protocol: "asc" }],
      });
      return {
        allocations: rows.map(serializeAllocation),
        assigned: rows.filter((r) => r.serverId).length,
        free: rows.filter((r) => !r.serverId).length,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/nodes/:id/allocations",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      const node = await prisma.node.findUnique({
        where: { id: request.params.id },
      });
      if (!node) {
        return reply.status(404).send({ error: "Node not found" });
      }
      const parsed = createRangeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const portEnd = parsed.data.portEnd ?? parsed.data.portStart;
      if (portEnd < parsed.data.portStart) {
        return reply.status(400).send({ error: "portEnd must be >= portStart" });
      }
      if (portEnd - parsed.data.portStart > 500) {
        return reply
          .status(400)
          .send({ error: "Range too large (max 500 ports)" });
      }
      const result = await createNodeAllocationRange({
        nodeId: node.id,
        portStart: parsed.data.portStart,
        portEnd,
        protocol: parsed.data.protocol,
        ip: parsed.data.ip,
        notes: parsed.data.notes,
      });
      const rows = await prisma.allocation.findMany({
        where: { nodeId: node.id },
        include: { server: { select: { name: true } } },
        orderBy: [{ port: "asc" }, { protocol: "asc" }],
      });
      logActivity({
        action: "allocation.pool-create",
        request,
        user: admin,
        metadata: {
          node: node.name,
          portStart: parsed.data.portStart,
          portEnd,
          protocol: parsed.data.protocol,
          created: result.created,
        },
      });
      return {
        ...result,
        allocations: rows.map(serializeAllocation),
      };
    },
  );

  app.delete<{ Params: { id: string; allocId: string } }>(
    "/api/admin/nodes/:id/allocations/:allocId",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply);
      if (!admin) return;
      const row = await prisma.allocation.findFirst({
        where: { id: request.params.allocId, nodeId: request.params.id },
      });
      if (!row) {
        return reply.status(404).send({ error: "Allocation not found" });
      }
      if (row.serverId) {
        return reply
          .status(400)
          .send({ error: "Unassign the allocation from its server first" });
      }
      await prisma.allocation.delete({ where: { id: row.id } });
      logActivity({
        action: "allocation.pool-delete",
        request,
        user: admin,
        metadata: { nodeId: row.nodeId, port: row.port, protocol: row.protocol },
      });
      return reply.status(204).send();
    },
  );
}
