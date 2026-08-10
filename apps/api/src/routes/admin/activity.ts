import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_PAGE_DEFAULT,
  ACTIVITY_PAGE_MAX,
  type ActivityListResponse,
} from "@guartrix/shared";
import { requireAdmin, requireServerAccess } from "../../auth/auth.js";
import { type ActivityEventWhereInput, listActivityPage } from "../../services/admin-activity.js";

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ACTIVITY_PAGE_MAX)
    .optional()
    .default(ACTIVITY_PAGE_DEFAULT),
  category: z.enum(ACTIVITY_CATEGORIES).optional(),
  action: z.string().max(64).optional(),
  q: z.string().max(120).optional(),
  serverId: z.string().max(64).optional(),
  userId: z.string().max(64).optional(),
});

type ActivityQueryInput = z.infer<typeof querySchema>;

function buildWhere(
  query: ActivityQueryInput,
  scope: { serverId?: string; serverIds?: string[] },
): ActivityEventWhereInput {
  const where: ActivityEventWhereInput = {};

  if (scope.serverId) {
    where.serverId = scope.serverId;
  } else if (scope.serverIds) {
    where.serverId = { in: scope.serverIds };
  } else if (query.serverId) {
    where.serverId = query.serverId;
  }

  if (query.category) where.category = query.category;
  if (query.action) where.action = query.action;
  if (query.userId) where.userId = query.userId;

  const term = query.q?.trim();
  if (term) {
    where.OR = [
      { actorName: { contains: term } },
      { serverName: { contains: term } },
      { action: { contains: term } },
      { metadata: { contains: term } },
      { actorIp: { contains: term } },
    ];
  }

  return where;
}

async function page(
  where: ActivityEventWhereInput,
  query: ActivityQueryInput,
): Promise<ActivityListResponse> {
  return listActivityPage(where, query);
}

export function registerActivityRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/servers/:id/activity", async (request, reply) => {
    // audit.read is accepted so existing subusers keep their log access.
    const access = await requireServerAccess(request, reply, request.params.id, {
      permission: ["activity.read", "audit.read"],
    });
    if (!access) return;

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const where = buildWhere(parsed.data, { serverId: access.server.id });
    return page(where, parsed.data);
  });

  app.get("/api/admin/activity", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "activity.read"))) return;

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const where = buildWhere(parsed.data, {});
    return page(where, parsed.data);
  });
}
