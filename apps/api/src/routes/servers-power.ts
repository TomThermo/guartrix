import type { FastifyInstance } from "fastify";
import { requireServerAccess } from "../auth/auth.js";
import { logActivity } from "../activity-log.js";
import { prisma } from "../db.js";
import { processManager } from "../servers/process-manager.js";
import { serverListInclude, toMcServer } from "../servers/serialize.js";

/** Start / stop / kill / restart routes (split from servers.ts). */
export function registerServerPowerRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>("/api/servers/:id/start", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.start",
    });
    if (!access) return;
    const server = access.server;
    try {
      const {
        assertLicenseAllowsPower,
        assertLicensePanelQuota,
        assertLicenseDiskQuota,
      } = await import("../license/license.js");
      await assertLicenseAllowsPower();
      await assertLicensePanelQuota(server.memoryMb, {
        excludeServerId: server.id,
      });
      await assertLicenseDiskQuota(server.diskMb);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      return reply.status(403).send({
        error: message,
        code: code || "LICENSE_INVALID",
      });
    }
    if (server.status === "TRANSFERRING" || server.status === "CREATING") {
      return reply
        .status(409)
        .send({ error: "Server is busy — wait for the current operation to finish" });
    }
    try {
      await prisma.server.update({
        where: { id: server.id },
        data: { stoppedByUser: false },
      });
      const { startServerIfLicensed } = await import("../license/license.js");
      await startServerIfLicensed(server.id);
      const updated = await prisma.server.findUniqueOrThrow({
        where: { id: server.id },
        include: serverListInclude,
      });
      logActivity({
        action: "server.start",
        request,
        user: access.user,
        server,
      });
      return toMcServer(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.start",
        request,
        user: access.user,
        server,
        success: false,
        metadata: { error: message },
      });
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/stop", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.stop",
    });
    if (!access) return;
    await processManager.stop(access.server.id);
    await prisma.server.update({
      where: { id: access.server.id },
      data: { stoppedByUser: true },
    });
    const updated = await prisma.server.findUniqueOrThrow({
      where: { id: access.server.id },
      include: serverListInclude,
    });
    logActivity({
      action: "server.stop",
      request,
      user: access.user,
      server: access.server,
    });
    return toMcServer(updated);
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/kill", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.kill",
    });
    if (!access) return;
    await processManager.kill(access.server.id);
    await prisma.server.update({
      where: { id: access.server.id },
      data: { stoppedByUser: true },
    });
    const updated = await prisma.server.findUniqueOrThrow({
      where: { id: access.server.id },
      include: serverListInclude,
    });
    logActivity({
      action: "server.kill",
      request,
      user: access.user,
      server: access.server,
    });
    return toMcServer(updated);
  });

  app.post<{ Params: { id: string } }>("/api/servers/:id/restart", async (request, reply) => {
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: "control.restart",
    });
    if (!access) return;
    const server = access.server;
    try {
      const {
        assertLicenseAllowsPower,
        assertLicensePanelQuota,
        assertLicenseDiskQuota,
      } = await import("../license/license.js");
      await assertLicenseAllowsPower();
      await assertLicensePanelQuota(server.memoryMb, {
        excludeServerId: server.id,
      });
      await assertLicenseDiskQuota(server.diskMb);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      return reply.status(403).send({
        error: message,
        code: code || "LICENSE_INVALID",
      });
    }
    try {
      if (processManager.isRunning(server.id)) {
        await processManager.stop(server.id);
      }
      await prisma.server.update({
        where: { id: server.id },
        data: { stoppedByUser: false },
      });
      const { startServerIfLicensed } = await import("../license/license.js");
      await startServerIfLicensed(server.id);
      const updated = await prisma.server.findUniqueOrThrow({
        where: { id: server.id },
        include: serverListInclude,
      });
      logActivity({
        action: "server.restart",
        request,
        user: access.user,
        server,
      });
      return toMcServer(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logActivity({
        action: "server.restart",
        request,
        user: access.user,
        server,
        success: false,
        metadata: { error: message },
      });
      return reply.status(400).send({ error: message });
    }
  });
}
