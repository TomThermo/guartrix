import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getStorageStatuses,
  mountStorage,
  setServerDataRoot,
  unmountStorage,
} from "@guartrix/node-agent";

const statusBodySchema = z.object({
  paths: z.array(z.string().min(1).max(512)).max(64),
});

const mountBodySchema = z.object({
  type: z.enum(["local", "nfs"]),
  mountPoint: z.string().min(1).max(512),
  hostPath: z.string().min(1).max(512).nullable().optional(),
  nfsServer: z.string().min(1).max(253).nullable().optional(),
  nfsExport: z.string().min(1).max(512).nullable().optional(),
  nfsOptions: z.string().max(256).nullable().optional(),
});

const unmountBodySchema = z.object({
  mountPoint: z.string().min(1).max(512),
  lazy: z.boolean().optional(),
  force: z.boolean().optional(),
});

const locationBodySchema = z.object({
  dataRoot: z.string().min(1).max(512).nullable(),
});

/** Host storage mount/unmount and per-server data-root overrides. */
export function registerStorageRoutes(app: FastifyInstance): void {
  app.post("/storage/status", async (request, reply) => {
    const parsed = statusBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const statuses = await getStorageStatuses(parsed.data.paths);
      return { statuses };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/storage/mount", async (request, reply) => {
    const parsed = mountBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const status = await mountStorage(parsed.data);
      return { ok: true, status };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/storage/unmount", async (request, reply) => {
    const parsed = unmountBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const status = await unmountStorage(parsed.data);
      return { ok: true, status };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.put<{ Params: { id: string } }>("/servers/:id/location", async (request, reply) => {
    const parsed = locationBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      await setServerDataRoot(request.params.id, parsed.data.dataRoot);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
