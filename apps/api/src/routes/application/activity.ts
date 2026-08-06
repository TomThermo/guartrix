import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireApplication } from "../../auth/application-auth.js";
import { prisma } from "../../db.js";

export function registerApplicationActivityRoutes(app: FastifyInstance): void {
  app.get("/api/application/activity", async (request, reply) => {
    if (!(await requireApplication(request, reply, "activity.read"))) return;
    const parsed = z
      .object({
        offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
        limit: z.coerce.number().int().min(1).max(200).optional().default(50),
        q: z.string().max(120).optional(),
        serverId: z.string().max(64).optional(),
        userId: z.string().max(64).optional(),
      })
      .safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { offset, limit, q, serverId, userId } = parsed.data;
    const where: {
      serverId?: string;
      userId?: string;
      OR?: Array<{ action?: { contains: string }; actorName?: { contains: string } }>;
    } = {};
    if (serverId) where.serverId = serverId;
    if (userId) where.userId = userId;
    if (q?.trim()) {
      const term = q.trim();
      where.OR = [{ action: { contains: term } }, { actorName: { contains: term } }];
    }
    const [total, rows] = await Promise.all([
      prisma.activityEvent.count({ where }),
      prisma.activityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);
    const { toActivityRecord } = await import("../../activity-log.js");
    return {
      total,
      offset,
      limit,
      events: rows.map(toActivityRecord),
    };
  });
}
