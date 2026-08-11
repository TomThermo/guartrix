import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../auth/auth.js";
import {
  createNodeStorage,
  deleteNodeStorage,
  listNodeStorages,
  mountNodeStorage,
  unmountNodeStorage,
  updateNodeStorage,
} from "../../services/node-storage.js";

const createSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(["LOCAL", "NFS"]),
  mountPoint: z.string().min(1).max(512).optional(),
  hostPath: z.string().min(1).max(512).nullable().optional(),
  nfsServer: z.string().min(1).max(253).nullable().optional(),
  nfsExport: z.string().min(1).max(512).nullable().optional(),
  nfsOptions: z.string().max(256).nullable().optional(),
  diskMb: z.number().int().min(0).max(10_485_760).optional(),
  enabled: z.boolean().optional(),
});

const updateSchema = createSchema.partial().omit({ type: true }).extend({
  type: z.enum(["LOCAL", "NFS"]).optional(),
});

const unmountSchema = z.object({
  force: z.boolean().optional(),
  lazy: z.boolean().optional(),
});

function statusFromErr(err: unknown): number {
  if (err && typeof err === "object" && "status" in err) {
    const s = Number((err as { status?: number }).status);
    if (Number.isFinite(s) && s >= 400 && s < 600) return s;
  }
  return 400;
}

export function registerNodeStorageRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/admin/nodes/:id/storages", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.read");
    if (!admin) return;
    try {
      const storages = await listNodeStorages(request.params.id);
      return { storages };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(statusFromErr(err)).send({ error: message });
    }
  });

  app.post<{ Params: { id: string } }>("/api/admin/nodes/:id/storages", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const storage = await createNodeStorage(request.params.id, parsed.data);
      return reply.status(201).send({ storage });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(statusFromErr(err)).send({ error: message });
    }
  });

  app.patch<{ Params: { id: string; storageId: string } }>(
    "/api/admin/nodes/:id/storages/:storageId",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const storage = await updateNodeStorage(
          request.params.id,
          request.params.storageId,
          parsed.data,
        );
        return { storage };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(statusFromErr(err)).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; storageId: string } }>(
    "/api/admin/nodes/:id/storages/:storageId",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      try {
        await deleteNodeStorage(request.params.id, request.params.storageId);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(statusFromErr(err)).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string; storageId: string } }>(
    "/api/admin/nodes/:id/storages/:storageId/mount",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      try {
        const storage = await mountNodeStorage(request.params.id, request.params.storageId);
        return { storage };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(statusFromErr(err)).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string; storageId: string } }>(
    "/api/admin/nodes/:id/storages/:storageId/unmount",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const parsed = unmountSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const storage = await unmountNodeStorage(
          request.params.id,
          request.params.storageId,
          parsed.data,
        );
        return { storage };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(statusFromErr(err)).send({ error: message });
      }
    },
  );
}
