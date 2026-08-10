import type { Server } from "@prisma/client";
import type { AuthUser } from "@guartrix/shared";
import type { FastifyRequest } from "fastify";
import { logActivity } from "../activity-log.js";
import { prisma } from "../db.js";
import { processManager } from "./process-manager.js";
import { serverListInclude, toMcServer } from "./serialize.js";

import type { ServerPermission } from "@guartrix/shared";

export type PowerResult =
  | { ok: true; server: ReturnType<typeof toMcServer> }
  | { ok: false; status: number; error: string; code?: string };

function busyResponse(): PowerResult {
  return {
    ok: false,
    status: 409,
    error: "Server is busy — wait for the current operation to finish",
  };
}

function suspendedResponse(): PowerResult {
  return {
    ok: false,
    status: 403,
    error: "Server is suspended — contact support or renew your plan",
    code: "SERVER_SUSPENDED",
  };
}

async function assertLicenseForPower(server: Server): Promise<PowerResult | null> {
  try {
    const { assertLicenseAllowsPower, assertLicensePanelQuota, assertLicenseDiskQuota } =
      await import("../license/license.js");
    await assertLicenseAllowsPower();
    await assertLicensePanelQuota(server.memoryMb, { excludeServerId: server.id });
    await assertLicenseDiskQuota(server.diskMb);
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code ?? "")
        : "";
    return {
      ok: false,
      status: 403,
      error: message,
      code: code || "LICENSE_INVALID",
    };
  }
}

export async function performServerPower(opts: {
  server: Server;
  signal: PowerSignal;
  user?: AuthUser | null;
  request?: FastifyRequest;
  actor?: string;
}): Promise<PowerResult> {
  const { server, signal, user, request, actor } = opts;

  if (server.status === "TRANSFERRING" || server.status === "CREATING") {
    return busyResponse();
  }

  if ((signal === "start" || signal === "restart") && server.suspended) {
    return suspendedResponse();
  }

  const activityBase = {
    request,
    user: user ?? undefined,
    server,
    actor,
  };

  if (signal === "start") {
    const licenseErr = await assertLicenseForPower(server);
    if (licenseErr) return licenseErr;
    try {
      // Already online (or panel cache was stale) — treat as success and heal
      // any leftover ERROR/"already running" banner instead of failing Start.
      const alreadyUp =
        processManager.isRunning(server.id) || (await processManager.refreshRunning(server.id));
      if (alreadyUp) {
        processManager.applyStatus(server.id, "RUNNING", null);
        await prisma.server.update({
          where: { id: server.id },
          data: { stoppedByUser: false, status: "RUNNING", errorMessage: null },
        });
        const updated = await prisma.server.findUniqueOrThrow({
          where: { id: server.id },
          include: serverListInclude,
        });
        logActivity({
          action: "server.start",
          ...activityBase,
          metadata: { alreadyRunning: true },
        });
        return { ok: true, server: toMcServer(updated) };
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
      logActivity({ action: "server.start", ...activityBase });
      return { ok: true, server: toMcServer(updated) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Race: daemon already had the process while panel cache said stopped.
      if (/already running/i.test(message)) {
        processManager.applyStatus(server.id, "RUNNING", null);
        await prisma.server.update({
          where: { id: server.id },
          data: { stoppedByUser: false, status: "RUNNING", errorMessage: null },
        });
        const updated = await prisma.server.findUniqueOrThrow({
          where: { id: server.id },
          include: serverListInclude,
        });
        logActivity({
          action: "server.start",
          ...activityBase,
          metadata: { alreadyRunning: true },
        });
        return { ok: true, server: toMcServer(updated) };
      }
      logActivity({
        action: "server.start",
        ...activityBase,
        success: false,
        metadata: { error: message },
      });
      return { ok: false, status: 400, error: message };
    }
  }

  if (signal === "stop") {
    await processManager.stop(server.id);
    await prisma.server.update({
      where: { id: server.id },
      data: { stoppedByUser: true },
    });
    const updated = await prisma.server.findUniqueOrThrow({
      where: { id: server.id },
      include: serverListInclude,
    });
    logActivity({ action: "server.stop", ...activityBase });
    return { ok: true, server: toMcServer(updated) };
  }

  if (signal === "kill") {
    await processManager.kill(server.id);
    await prisma.server.update({
      where: { id: server.id },
      data: { stoppedByUser: true },
    });
    const updated = await prisma.server.findUniqueOrThrow({
      where: { id: server.id },
      include: serverListInclude,
    });
    logActivity({ action: "server.kill", ...activityBase });
    return { ok: true, server: toMcServer(updated) };
  }

  // restart
  const licenseErr = await assertLicenseForPower(server);
  if (licenseErr) return licenseErr;
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
    logActivity({ action: "server.restart", ...activityBase });
    return { ok: true, server: toMcServer(updated) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logActivity({
      action: "server.restart",
      ...activityBase,
      success: false,
      metadata: { error: message },
    });
    return { ok: false, status: 400, error: message };
  }
}

export type PowerSignal = "start" | "stop" | "restart" | "kill";

export const POWER_PERMISSION: Record<PowerSignal, ServerPermission> = {
  start: "control.start",
  stop: "control.stop",
  restart: "control.restart",
  kill: "control.kill",
};

export function isPowerSignal(value: string): value is PowerSignal {
  return value === "start" || value === "stop" || value === "restart" || value === "kill";
}
