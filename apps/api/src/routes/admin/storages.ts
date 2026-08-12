import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../../auth/auth.js";
import {
  createStoragePool,
  deleteStoragePool,
  getStoragePool,
  linkStorageNode,
  listStoragePools,
  listStoragePoolsForNode,
  mountStorageOnNode,
  unlinkStorageNode,
  unmountStorageOnNode,
  updateStorageNodeLink,
  updateStoragePool,
} from "../../services/storage-pools.js";

const createSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(["LOCAL", "NFS"]),
  nfsServer: z.string().min(1).max(253).nullable().optional(),
  nfsExport: z.string().min(1).max(512).nullable().optional(),
  nfsOptions: z.string().max(256).nullable().optional(),
  diskMb: z.number().int().min(0).max(10_485_760).optional(),
  enabled: z.boolean().optional(),
  nodeId: z.string().min(1).optional(),
  mountPoint: z.string().min(1).max(512).optional(),
  hostPath: z.string().min(1).max(512).nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  type: z.enum(["LOCAL", "NFS"]).optional(),
  nfsServer: z.string().min(1).max(253).nullable().optional(),
  nfsExport: z.string().min(1).max(512).nullable().optional(),
  nfsOptions: z.string().max(256).nullable().optional(),
  diskMb: z.number().int().min(0).max(10_485_760).optional(),
  enabled: z.boolean().optional(),
});

const linkSchema = z.object({
  nodeId: z.string().min(1),
  mountPoint: z.string().min(1).max(512).optional(),
  hostPath: z.string().min(1).max(512).nullable().optional(),
});

const linkUpdateSchema = z.object({
  mountPoint: z.string().min(1).max(512).optional(),
  hostPath: z.string().min(1).max(512).nullable().optional(),
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

export function registerAdminStorageRoutes(app: FastifyInstance): void {
  app.get("/api/admin/storages", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.read");
    if (!admin) return;
    try {
      const storages = await listStoragePools();
      return { storages };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(statusFromErr(err)).send({ error: message });
    }
  });

  app.post("/api/admin/storages", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const storage = await createStoragePool(parsed.data);
      return reply.status(201).send({ storage });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(statusFromErr(err)).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>("/api/admin/storages/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.read");
    if (!admin) return;
    try {
      const storage = await getStoragePool(request.params.id);
      return { storage };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(statusFromErr(err)).send({ error: message });
    }
  });

  app.patch<{ Params: { id: string } }>("/api/admin/storages/:id", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const storage = await updateStoragePool(request.params.id, parsed.data);
      return { storage };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(statusFromErr(err)).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string }; Querystring: { force?: string } }>(
    "/api/admin/storages/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      try {
        await deleteStoragePool(request.params.id, {
          force: request.query.force === "1" || request.query.force === "true",
        });
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(statusFromErr(err)).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string } }>("/api/admin/storages/:id/nodes", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const parsed = linkSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const storage = await linkStorageNode(request.params.id, parsed.data);
      return { storage };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(statusFromErr(err)).send({ error: message });
    }
  });

  app.patch<{ Params: { id: string; nodeId: string } }>(
    "/api/admin/storages/:id/nodes/:nodeId",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const parsed = linkUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const storage = await updateStorageNodeLink(
          request.params.id,
          request.params.nodeId,
          parsed.data,
        );
        return { storage };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(statusFromErr(err)).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string; nodeId: string } }>(
    "/api/admin/storages/:id/nodes/:nodeId",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      try {
        const storage = await unlinkStorageNode(request.params.id, request.params.nodeId);
        return { storage };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(statusFromErr(err)).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string; nodeId: string } }>(
    "/api/admin/storages/:id/nodes/:nodeId/mount",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      try {
        const storage = await mountStorageOnNode(request.params.id, request.params.nodeId);
        return { storage };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(statusFromErr(err)).send({ error: message });
      }
    },
  );

  app.post<{ Params: { id: string; nodeId: string } }>(
    "/api/admin/storages/:id/nodes/:nodeId/unmount",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const parsed = unmountSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const storage = await unmountStorageOnNode(
          request.params.id,
          request.params.nodeId,
          parsed.data,
        );
        return { storage };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(statusFromErr(err)).send({ error: message });
      }
    },
  );

  /** Create-server / node-scoped list of pools linked to a node. */
  app.get<{ Params: { id: string } }>("/api/admin/nodes/:id/storages", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.read");
    if (!admin) return;
    try {
      const storages = await listStoragePoolsForNode(request.params.id);
      return { storages };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(statusFromErr(err)).send({ error: message });
    }
  });
}
