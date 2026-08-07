import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clampBackupKeepCount } from "@msm/shared";
import { requireAdmin } from "../../auth/auth.js";
import { logActivity } from "../../activity-log.js";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { errorMessage } from "../../http-error.js";
import { listBackups } from "../../servers/backups.js";
import {
  readBackupSchedule,
  writeBackupSchedule,
} from "../../servers/backup-schedule.js";
import { processManager } from "../../servers/process-manager.js";
import { daemonSetLimits } from "../../nodes/daemon-client.js";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  memoryMb: z.number().int().min(512).max(65536).optional(),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  ownerId: z.string().nullable().optional(),
  suspended: z.boolean().optional(),
  keepCount: z.number().int().min(1).max(50).optional(),
});

async function loadAdminServerRow(
  row: {
    id: string;
    name: string;
    ownerId: string | null;
    owner: { username: string } | null;
    nodeId: string | null;
    node: { name: string } | null;
    status: string;
    type: string;
    mcVersion: string;
    port: number;
    memoryMb: number;
    diskMb: number;
    cpuLimit: number;
    suspended: boolean;
    backupSchedule: { keepCount: number; mode: string } | null;
  },
): Promise<import("@msm/shared").AdminServerRow> {
  const schedule = row.backupSchedule
    ? {
        keepCount: row.backupSchedule.keepCount,
        mode: row.backupSchedule.mode as import("@msm/shared").BackupScheduleMode,
      }
    : await readBackupSchedule(row.id);
  let backupCount = 0;
  try {
    backupCount = (await listBackups(row.id)).length;
  } catch {
    backupCount = 0;
  }
  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    ownerUsername: row.owner?.username ?? "—",
    nodeId: row.nodeId,
    nodeName: row.node?.name ?? null,
    status: row.status,
    type: row.type,
    mcVersion: row.mcVersion,
    port: row.port,
    memoryMb: row.memoryMb,
    diskMb: row.diskMb,
    cpuLimit: row.cpuLimit,
    suspended: row.suspended ?? false,
    keepCount: schedule.keepCount,
    backupCount,
    scheduleMode: schedule.mode,
  };
}

const serverSelect = {
  id: true,
  name: true,
  ownerId: true,
  owner: { select: { username: true } },
  nodeId: true,
  node: { select: { name: true } },
  status: true,
  type: true,
  mcVersion: true,
  port: true,
  memoryMb: true,
  diskMb: true,
  cpuLimit: true,
  suspended: true,
  backupSchedule: {
    select: { keepCount: true, mode: true },
  },
} as const;

export function registerAdminServerRoutes(app: FastifyInstance): void {
  app.get("/api/admin/servers", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "settings.read"))) return;

    const rows = await prisma.server.findMany({
      orderBy: { name: "asc" },
      select: serverSelect,
    });

    const servers = await Promise.all(rows.map((row) => loadAdminServerRow(row)));

    return {
      defaultKeepCount: config.defaultBackupKeepCount,
      servers,
    };
  });

  /** Backward-compatible alias for pre-1.2.6 clients. */
  app.get("/api/admin/server-backups", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "settings.read"))) return;

    const rows = await prisma.server.findMany({
      orderBy: { name: "asc" },
      select: serverSelect,
    });

    const servers = await Promise.all(rows.map((row) => loadAdminServerRow(row)));

    return {
      defaultKeepCount: config.defaultBackupKeepCount,
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        ownerUsername: s.ownerUsername,
        keepCount: s.keepCount,
        backupCount: s.backupCount,
        scheduleMode: s.scheduleMode,
      })),
    };
  });

  app.patch<{ Params: { serverId: string }; Body: unknown }>(
    "/api/admin/servers/:serverId",
    async (request, reply) => {
      const user = await requireAdmin(request, reply, "settings.write");
      if (!user) return;

      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const existing = await prisma.server.findUnique({
        where: { id: request.params.serverId },
        select: serverSelect,
      });
      if (!existing) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const data = parsed.data;
      const nextOwnerId =
        data.ownerId !== undefined ? data.ownerId : existing.ownerId;

      if (data.ownerId !== undefined && data.ownerId !== null) {
        const owner = await prisma.user.findUnique({ where: { id: data.ownerId } });
        if (!owner) return reply.status(400).send({ error: "Owner user not found" });
      }

      if (data.memoryMb !== undefined && data.memoryMb !== existing.memoryMb) {
        if (nextOwnerId) {
          const owner = await prisma.user.findUnique({ where: { id: nextOwnerId } });
          if (owner) {
            try {
              const { assertCanAllocateMemory } = await import("../../billing/quotas.js");
              await assertCanAllocateMemory(owner, data.memoryMb, {
                excludeServerId: existing.id,
                diskMb: data.diskMb ?? existing.diskMb,
              });
            } catch (err) {
              return reply.status(403).send({ error: errorMessage(err) });
            }
          }
        }
        if (existing.nodeId) {
          try {
            const { assertNodeCapacity } = await import("../../nodes/nodes.js");
            await assertNodeCapacity(existing.nodeId, data.memoryMb, {
              excludeServerId: existing.id,
            });
          } catch (err) {
            return reply.status(403).send({ error: errorMessage(err) });
          }
        }
      }

      if (data.diskMb !== undefined && data.diskMb !== existing.diskMb) {
        try {
          const { assertLicenseDiskQuota } = await import("../../license/license.js");
          await assertLicenseDiskQuota(data.diskMb);
        } catch (err) {
          return reply.status(403).send({ error: errorMessage(err) });
        }
      }

      if (data.suspended === true && processManager.isRunning(existing.id)) {
        await processManager.stop(existing.id);
      }

      const updated = await prisma.server.update({
        where: { id: existing.id },
        data: {
          ...(data.name != null ? { name: data.name } : {}),
          ...(data.memoryMb != null ? { memoryMb: data.memoryMb } : {}),
          ...(data.diskMb != null ? { diskMb: data.diskMb } : {}),
          ...(data.cpuLimit != null ? { cpuLimit: data.cpuLimit } : {}),
          ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
          ...(data.suspended != null ? { suspended: data.suspended } : {}),
        },
        select: serverSelect,
      });

      if (data.diskMb != null || data.cpuLimit != null) {
        try {
          await daemonSetLimits(existing.id, {
            diskMb: updated.diskMb,
            cpuLimit: updated.cpuLimit,
          });
        } catch {
          // applied again on next start
        }
      }

      if (data.keepCount != null) {
        await writeBackupSchedule(existing.id, {
          keepCount: clampBackupKeepCount(data.keepCount),
        });
      }

      const server = await loadAdminServerRow(updated);

      logActivity({
        action: "admin.server-update",
        request,
        user,
        serverId: server.id,
        serverName: server.name,
        metadata: { fields: Object.keys(data) },
      });

      return { server };
    },
  );

  /** Backward-compatible alias — keepCount only. */
  app.put<{ Params: { serverId: string }; Body: unknown }>(
    "/api/admin/server-backups/:serverId",
    async (request, reply) => {
      const user = await requireAdmin(request, reply, "settings.write");
      if (!user) return;

      const parsed = z
        .object({ keepCount: z.number().int().min(1).max(50) })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const existing = await prisma.server.findUnique({
        where: { id: request.params.serverId },
        select: { id: true, name: true },
      });
      if (!existing) {
        return reply.status(404).send({ error: "Server not found" });
      }

      const schedule = await writeBackupSchedule(existing.id, {
        keepCount: clampBackupKeepCount(parsed.data.keepCount),
      });

      logActivity({
        action: "admin.server-backup-retention",
        request,
        user,
        serverId: existing.id,
        serverName: existing.name,
        metadata: { keepCount: schedule.keepCount },
      });

      let backupCount = 0;
      try {
        backupCount = (await listBackups(existing.id)).length;
      } catch {
        backupCount = 0;
      }

      return {
        server: {
          id: existing.id,
          name: existing.name,
          keepCount: schedule.keepCount,
          backupCount,
          scheduleMode: schedule.mode,
        },
      };
    },
  );
}
