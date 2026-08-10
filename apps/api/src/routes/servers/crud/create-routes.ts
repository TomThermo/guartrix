import type { FastifyInstance } from "fastify";
import type { ServerType } from "@guartrix/shared";
import { assertAdminFullApiKey, requireWrite } from "../../../auth/auth.js";
import { listVersions } from "../../../providers/jars.js";
import { createPanelServer } from "../../../services/servers-create.js";
import { toMcServer } from "../../../servers/serialize.js";
import { createSchema, SERVER_TYPES } from "./schemas.js";

export function registerServerCreateRoutes(app: FastifyInstance): void {
  app.get("/api/servers/create-defaults", async (request, reply) => {
    const user = await requireWrite(request, reply);
    if (!user) return;
    const { config } = await import("../../../config.js");
    return { defaultBackupKeepCount: config.defaultBackupKeepCount };
  });

  app.post("/api/servers", async (request, reply) => {
    const user = await requireWrite(request, reply);
    if (!user) return;

    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    if (parsed.data.nodeId && user.role === "ADMIN" && !assertAdminFullApiKey(request, reply)) {
      return;
    }

    const result = await createPanelServer(user, parsed.data, request);
    if (!result.ok) {
      return reply
        .status(result.status)
        .send(typeof result.error === "string" ? { error: result.error } : result.error);
    }
    return reply.status(result.status).send(result.body);
  });

  app.get<{ Querystring: { type?: string } }>("/api/versions", async (request, reply) => {
    const type = (request.query.type ?? "VANILLA").toUpperCase();
    if (!(SERVER_TYPES as readonly string[]).includes(type)) {
      return reply.status(400).send({ error: "Invalid type" });
    }
    try {
      const versions = await listVersions(type as ServerType);
      return { type, versions };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(502).send({ error: message });
    }
  });
}
