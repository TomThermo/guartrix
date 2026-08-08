import type { FastifyInstance } from "fastify";
import dns from "node:dns/promises";
import { primaryAllocationProtocol } from "@msm/shared";
import { requireAdmin, requireAuth } from "../../auth/auth.js";
import { config } from "../../config.js";
import { listNodesWithUsage } from "../../nodes/nodes.js";
import { serverTypeSchema } from "./schemas.js";
import { resolveListedNode } from "./serialize.js";

export function registerNodeListRoutes(app: FastifyInstance): void {
  /** Any logged-in user — used when creating a server (node picker). */
  app.get("/api/nodes", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const nodes = await listNodesWithUsage();
    return {
      nodes: nodes.filter((n) => n.deployable && !n.maintenanceMode),
    };
  });

  app.get<{
    Params: { id: string };
    Querystring: { type?: string };
  }>("/api/nodes/:id/suggested-port", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const node = await resolveListedNode(request.params.id);
    if (!node) return reply.status(404).send({ error: "Node not found" });
    const parsed = serverTypeSchema.safeParse(request.query.type ?? "PAPER");
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid server type" });
    }
    try {
      const { pickFreeGamePort } = await import("../../servers/game-port.js");
      const port = await pickFreeGamePort(node.id, parsed.data);
      const protocol = primaryAllocationProtocol(parsed.data);
      return { port, protocol };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(409).send({ error: message });
    }
  });

  app.get<{
    Params: { id: string };
    Querystring: { port?: string; type?: string };
  }>("/api/nodes/:id/port-check", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    const node = await resolveListedNode(request.params.id);
    if (!node) return reply.status(404).send({ error: "Node not found" });
    const port = Number(request.query.port);
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      return reply.status(400).send({ error: "port is required (1024–65535)" });
    }
    const parsed = serverTypeSchema.safeParse(request.query.type ?? "PAPER");
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid server type" });
    }
    const { isGamePortAvailable } = await import("../../servers/game-port.js");
    const protocol = primaryAllocationProtocol(parsed.data);
    const free = await isGamePortAvailable(node.id, port, parsed.data);
    return { free, port, protocol };
  });

  app.get("/api/admin/nodes", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "nodes.read"))) return;
    return { nodes: await listNodesWithUsage() };
  });

  /** Resolve FQDN/IP for Basic Settings DNS hint. */
  app.get("/api/admin/dns-lookup", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "nodes.read"))) return;
    const q = (request.query ?? {}) as Record<string, unknown>;
    const host = String(q.host ?? q.fqdn ?? "")
      .trim()
      .replace(/^\[|\]$/g, "");
    const panelSecure = /^https:/i.test(config.publicBaseUrl);
    if (!host) {
      return reply.status(400).send({
        error: "host required",
        panelSecure,
      });
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
      return {
        host,
        ok: true,
        addresses: [host],
        kind: "ip" as const,
        panelSecure,
      };
    }
    try {
      const answers = await dns.lookup(host, { all: true, verbatim: true });
      const addresses = [...new Set(answers.map((a) => a.address).filter((a) => Boolean(a)))];
      return {
        host,
        ok: addresses.length > 0,
        addresses,
        kind: "dns" as const,
        panelSecure,
      };
    } catch (err) {
      return {
        host,
        ok: false,
        addresses: [] as string[],
        kind: "dns" as const,
        panelSecure,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}
