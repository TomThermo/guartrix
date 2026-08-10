import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin, verifyAccountPassword } from "../../auth/auth.js";
import {
  getNodeInstallBundle,
  runAdminNodeRemoteInstall,
} from "../../services/nodes-admin.js";

export function registerNodeAdminInstallRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string } }>("/api/admin/nodes/:id/install", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "nodes.write"))) return;
    const result = await getNodeInstallBundle(request.params.id);
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    const { ok: _ok, ...payload } = result;
    return payload;
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/admin/nodes/:id/remote-install",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;

      const schema = z.object({
        sshHost: z.string().min(1).max(255).optional(),
        sshPort: z.number().int().min(1).max(65535).optional().default(22),
        sshUser: z.string().min(1).max(64),
        sshPassword: z.string().min(1).max(512).optional(),
        sshPrivateKey: z.string().min(1).max(16_000).optional(),
        panelPassword: z.string().min(1).max(512),
        trustHostKey: z.boolean().optional().default(false),
        replaceHostKey: z.boolean().optional().default(false),
        expectedHostKeyFingerprint: z.string().min(16).max(128).optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      if (!(await verifyAccountPassword(request, parsed.data.panelPassword))) {
        return reply.status(403).send({ error: "Incorrect panel password" });
      }
      if (!parsed.data.sshPassword && !parsed.data.sshPrivateKey) {
        return reply.status(400).send({ error: "Provide sshPassword and/or sshPrivateKey" });
      }

      const wantStream =
        String(request.headers.accept ?? "").includes("application/x-ndjson") ||
        String((request.query as { stream?: string } | undefined)?.stream) === "1";

      if (wantStream) {
        reply.hijack();
        reply.raw.writeHead(200, {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        const writeLine = (obj: unknown) => {
          try {
            reply.raw.write(`${JSON.stringify(obj)}\n`);
            const flusher = reply.raw as unknown as { flush?: () => void };
            if (typeof flusher.flush === "function") flusher.flush();
          } catch {
            // client gone
          }
        };
        try {
          const result = await runAdminNodeRemoteInstall(
            request,
            admin,
            request.params.id,
            parsed.data,
            (chunk) => writeLine(chunk),
          );
          if (result.ok) {
            writeLine({
              type: "status",
              message: "Install OK — testing panel → daemon connection…",
            });
          }
          writeLine({ type: "done", ...result.payload });
        } catch (err) {
          writeLine({
            type: "done",
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            exitCode: null,
            stdout: "",
            stderr: "",
          });
        }
        try {
          reply.raw.end();
        } catch {
          // ignore
        }
        return;
      }

      const result = await runAdminNodeRemoteInstall(
        request,
        admin,
        request.params.id,
        parsed.data,
      );
      if (!result.ok && result.status !== 200) {
        return reply.status(result.status).send(result.payload);
      }
      return result.payload;
    },
  );
}
