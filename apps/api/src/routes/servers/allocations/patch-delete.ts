import type { FastifyInstance } from "fastify";
import { primaryAllocationProtocol } from "@guartrix/shared";
import { logActivity } from "../../../activity-log.js";
import { requireServerAccess } from "../../../auth/auth.js";
import { ensureUdpCompanion, serializeAllocation } from "../../../servers/allocations.js";
import { changeFirewallPort, closeFirewallPort } from "../../../nodes/firewall.js";
import { prisma } from "../../../db.js";
import { processManager } from "../../../servers/process-manager.js";
import { updateServerProperties } from "../../../servers/properties.js";
import { patchSchema } from "./schemas.js";

export function registerAllocationPatchDeleteRoutes(app: FastifyInstance): void {
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
            "The primary port cannot be demoted — promote another allocation with the correct protocol instead",
        });
      }

      if (parsed.data.isPrimary === true && !row.isPrimary) {
        if (processManager.isRunning(access.server.id) || access.server.status === "RUNNING") {
          return reply
            .status(409)
            .send({ error: "Stop the server before changing the primary port" });
        }
        const primaryProtocol = primaryAllocationProtocol(access.server.type);
        if (row.protocol !== primaryProtocol) {
          return reply.status(400).send({
            error: `Only ${primaryProtocol.toUpperCase()} allocations can be primary for this server type`,
          });
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
          await changeFirewallPort(oldPort, newPort, access.server.nodeId, primaryProtocol);
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
              protocol: primaryProtocol,
            },
            data: { isPrimary: true },
          });
          await updateServerProperties(access.server.id, {}, oldPort);
          const message = err instanceof Error ? err.message : String(err);
          return reply.status(500).send({ error: `Firewall update failed: ${message}` });
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
          notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
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
}
