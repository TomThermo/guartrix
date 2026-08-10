import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { closeFirewallPort, openFirewallPort } from "@guartrix/node-agent";

const portBodySchema = z.object({
  port: z.number().int().min(1024).max(65535),
  protocol: z.enum(["tcp", "udp"]).optional().default("tcp"),
});

/** Host firewall port open/close routes, used when a server's ports change. */
export function registerFirewallRoutes(app: FastifyInstance): void {
  app.post("/firewall/open", async (request, reply) => {
    const parsed = portBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      await openFirewallPort(parsed.data.port, parsed.data.protocol);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/firewall/close", async (request, reply) => {
    const parsed = portBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      await closeFirewallPort(parsed.data.port, parsed.data.protocol);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
