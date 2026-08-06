import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  BEDROCK_SERVER_TYPES,
  JAVA_SERVER_TYPES,
  primaryAllocationProtocol,
} from "@msm/shared";
import { logActivity } from "../../activity-log.js";
import { requireAdmin, requireAuth } from "../../auth/auth.js";
import { prisma } from "../../db.js";
import {
  daemonTestNode,
  setNodeToken,
  clearNodeToken,
} from "../../nodes/daemon-client.js";
import {
  generateDaemonToken,
  hashDaemonToken,
  listNodesWithUsage,
  removeNodeSftpDns,
  syncNodeSftpDns,
  writeLocalDaemonEnvIfLocal,
} from "../../nodes/nodes.js";

const locationSchema = z
  .union([z.string().max(64), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return v;
    const t = v.trim();
    return t.length > 0 ? t : null;
  });

const createSchema = z.object({
  name: z.string().min(1).max(64),
  fqdn: z.string().min(1).max(255),
  scheme: z.enum(["http", "https"]).optional().default("http"),
  daemonPort: z.number().int().min(1).max(65535).optional().default(8081),
  memoryMb: z.number().int().min(0).optional().default(0),
  location: locationSchema,
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  fqdn: z.string().min(1).max(255).optional(),
  scheme: z.enum(["http", "https"]).optional(),
  daemonPort: z.number().int().min(1).max(65535).optional(),
  memoryMb: z.number().int().min(0).optional(),
  location: locationSchema,
});

async function serializeNodeWithUsage(nodeId: string) {
  const nodes = await listNodesWithUsage();
  const found = nodes.find((n) => n.id === nodeId);
  if (!found) throw new Error("Node not found");
  return found;
}

const SERVER_TYPES = [
  ...JAVA_SERVER_TYPES,
  ...BEDROCK_SERVER_TYPES,
] as const;

const serverTypeSchema = z.enum(SERVER_TYPES);

async function resolveListedNode(nodeId: string) {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return null;
  return node;
}

export function registerNodeRoutes(app: FastifyInstance): void {
  /** Any logged-in user — used when creating a server (node picker). */
  app.get("/api/nodes", async (request, reply) => {
    if (!(await requireAuth(request, reply))) return;
    return { nodes: await listNodesWithUsage() };
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

  app.post("/api/admin/nodes", async (request, reply) => {
    const admin = await requireAdmin(request, reply, "nodes.write");
    if (!admin) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const { assertLicenseNodeQuota } = await import("../../license/license.js");
      await assertLicenseNodeQuota();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      return reply.status(403).send({
        error: message,
        code: code || "LICENSE_QUOTA",
      });
    }
    const token = generateDaemonToken();
    const sftpPort = Number(process.env.SFTP_PORT ?? 2022) || 2022;
    const location = parsed.data.location ?? null;
    const node = await prisma.node.create({
      data: {
        id: nanoid(12),
        name: parsed.data.name,
        fqdn: parsed.data.fqdn,
        scheme: parsed.data.scheme,
        daemonPort: parsed.data.daemonPort,
        memoryMb: parsed.data.memoryMb,
        location,
        tokenHash: hashDaemonToken(token),
        isLocal: false,
        status: "UNKNOWN",
        sftpPort,
      },
    });
    setNodeToken(node.id, token);
    await syncNodeSftpDns(node.id);
    logActivity({
      action: "node.create",
      request,
      user: admin,
      metadata: {
        node: node.name,
        fqdn: node.fqdn,
        daemonPort: node.daemonPort,
        memoryMb: node.memoryMb,
      },
    });
    return {
      node: await serializeNodeWithUsage(node.id),
      token,
    };
  });

  app.patch<{ Params: { id: string } }>(
    "/api/admin/nodes/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const existing = await prisma.node.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const data: {
        name?: string;
        fqdn?: string;
        scheme?: string;
        daemonPort?: number;
        memoryMb?: number;
        location?: string | null;
      } = { ...parsed.data };
      if (parsed.data.location !== undefined) {
        data.location = parsed.data.location;
      }
      await prisma.node.update({
        where: { id: request.params.id },
        data,
      });
      if (parsed.data.name || parsed.data.fqdn) {
        await syncNodeSftpDns(request.params.id);
      }
      // Local daemon bind port comes from env DAEMON_PORT (daemon.env), not from
      // node.daemonPort (which may be the public HTTPS port behind prod-web).
      logActivity({
        action: "node.update",
        request,
        user: admin,
        metadata: { node: existing.name, fields: Object.keys(parsed.data) },
      });
      return { node: await serializeNodeWithUsage(request.params.id) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/nodes/:id",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const existing = await prisma.node.findUnique({
        where: { id: request.params.id },
        include: { _count: { select: { servers: true } } },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      if (existing.isLocal) {
        return reply.status(400).send({ error: "Cannot delete the local node" });
      }
      if (existing._count.servers > 0) {
        return reply
          .status(400)
          .send({ error: "Node still has servers assigned" });
      }
      await removeNodeSftpDns(request.params.id);
      await prisma.node.delete({ where: { id: request.params.id } });
      clearNodeToken(request.params.id);
      logActivity({
        action: "node.delete",
        request,
        user: admin,
        metadata: { node: existing.name, fqdn: existing.fqdn },
      });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/nodes/:id/test",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, "nodes.write"))) return;
      const existing = await prisma.node.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const result = await daemonTestNode(request.params.id);
      if (result.ok) {
        await syncNodeSftpDns(request.params.id, result.system.publicIp);
      }
      return {
        ...result,
        node: await serializeNodeWithUsage(request.params.id),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/admin/nodes/:id/regenerate-token",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const existing = await prisma.node.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const token = generateDaemonToken();
      const node = await prisma.node.update({
        where: { id: existing.id },
        data: { tokenHash: hashDaemonToken(token) },
      });
      setNodeToken(node.id, token);
      if (node.isLocal) {
        writeLocalDaemonEnvIfLocal(token, node.daemonPort, node.id);
      }
      logActivity({
        action: "node.token-rotate",
        request,
        user: admin,
        metadata: { node: node.name },
      });
      return {
        node: await serializeNodeWithUsage(node.id),
        token,
      };
    },
  );

  /** multi-node install snippet for a remote node (token + env + commands). */
  app.get<{ Params: { id: string } }>(
    "/api/admin/nodes/:id/install",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply, "nodes.write"))) return;
      const node = await prisma.node.findUnique({
        where: { id: request.params.id },
      });
      if (!node) return reply.status(404).send({ error: "Not found" });
      const { getNodeToken } = await import("../../nodes/daemon-client.js");
      const { nodePublicUrl } = await import("../../nodes/nodes.js");
      const {
        defaultRepoUrl,
        panelPublicBase,
        buildDaemonInstallScript,
      } = await import("../../nodes/remote-install.js");
      const token = getNodeToken(node.id);
      if (!token) {
        return reply.status(409).send({
          error:
            "Daemon token not in vault — regenerate the token, then open install again.",
        });
      }
      const panelUrl = panelPublicBase();
      const repoUrl = defaultRepoUrl();
      const sftpPort = node.sftpPort || 2022;
      const envBody = [
        `# Guartrix remote daemon — node ${node.name} (${node.id})`,
        `DAEMON_TOKEN=${token}`,
        `DAEMON_NODE_ID=${node.id}`,
        `DAEMON_PORT=${node.daemonPort}`,
        `DAEMON_HOST=0.0.0.0`,
        `DATA_DIR=/var/lib/guartrix`,
        `PUBLIC_HOST=${node.fqdn}`,
        `PANEL_URL=${panelUrl}`,
        `SFTP_PORT=${sftpPort}`,
        `SFTP_ENABLED=true`,
        `DAEMON_JWT_TTL=900`,
        `DAEMON_JWT_WS_TTL=3600`,
        `DAEMON_JWT_LEGACY=false`,
        `DOCKER_IMAGE=${process.env.DOCKER_IMAGE ?? "eclipse-temurin:25-jre-jammy"}`,
        // Remote nodes default to per-server isolation (multi-tenant safe).
        `DOCKER_NETWORK_MODE=${(process.env.DOCKER_NETWORK_MODE ?? "per_server").trim() || "per_server"}`,
        `MANAGE_FIREWALL=true`,
        "",
      ].join("\n");
      const curlInstall = buildDaemonInstallScript({
        token,
        nodeId: node.id,
        fqdn: node.fqdn,
        daemonPort: node.daemonPort,
        panelUrl,
        sftpPort,
        repoUrl,
      });
      const installCommand = `sudo bash -c ${JSON.stringify(curlInstall)}`;
      return {
        node: await serializeNodeWithUsage(node.id),
        token,
        publicUrl: nodePublicUrl(node),
        envFile: envBody,
        installCommand,
        curlInstall,
        repoUrl,
        sshHostKeyFingerprint: node.sshHostKeyFingerprint ?? null,
        steps: [
          "Easiest: fill in SSH details below and click “Install via SSH” (panel connects and installs).",
          "First SSH: confirm the host-key fingerprint, then trust it (stored on the node).",
          "Or SSH to the VPS yourself and run the install command (curl | bash).",
          `Firewall: daemon ${node.daemonPort}/tcp is restricted to the panel host when possible; keep ${sftpPort}/tcp + game ports open.`,
          "Click “Test connection” in the panel.",
        ],
      };
    },
  );

  /** One-shot remote install over SSH (password or key). Credentials are not stored.
   *  Send `Accept: application/x-ndjson` for live stream chunks (status/stdout/stderr/done). */
  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/admin/nodes/:id/remote-install",
    async (request, reply) => {
      const admin = await requireAdmin(request, reply, "nodes.write");
      if (!admin) return;
      const node = await prisma.node.findUnique({
        where: { id: request.params.id },
      });
      if (!node) return reply.status(404).send({ error: "Not found" });
      if (node.isLocal) {
        return reply
          .status(400)
          .send({ error: "Local node is managed by the panel host" });
      }

      const schema = z.object({
        sshHost: z.string().min(1).max(255).optional(),
        sshPort: z.number().int().min(1).max(65535).optional().default(22),
        sshUser: z.string().min(1).max(64),
        sshPassword: z.string().min(1).max(512).optional(),
        sshPrivateKey: z.string().min(1).max(16_000).optional(),
        /** First contact: admin confirms the presented host-key fingerprint. */
        trustHostKey: z.boolean().optional().default(false),
        /** Stored fingerprint no longer matches (VPS rebuild) — replace after verify. */
        replaceHostKey: z.boolean().optional().default(false),
        /** Optional pin (must match presented key). */
        expectedHostKeyFingerprint: z.string().min(16).max(128).optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      if (!parsed.data.sshPassword && !parsed.data.sshPrivateKey) {
        return reply
          .status(400)
          .send({ error: "Provide sshPassword and/or sshPrivateKey" });
      }

      const { getNodeToken } = await import("../../nodes/daemon-client.js");
      const {
        defaultRepoUrl,
        panelPublicBase,
        buildDaemonInstallScript,
        runRemoteDaemonInstall,
      } = await import("../../nodes/remote-install.js");
      const token = getNodeToken(node.id);
      if (!token) {
        return reply.status(409).send({
          error: "Daemon token not in vault — regenerate token first.",
        });
      }

      const panelUrl = panelPublicBase();
      const installScript = buildDaemonInstallScript({
        token,
        nodeId: node.id,
        fqdn: node.fqdn,
        daemonPort: node.daemonPort,
        panelUrl,
        sftpPort: node.sftpPort || 2022,
        repoUrl: defaultRepoUrl(),
      });

      const wantStream =
        String(request.headers.accept ?? "").includes("application/x-ndjson") ||
        String((request.query as { stream?: string } | undefined)?.stream) ===
          "1";

      const persistTrustedKey = async (fp: string | undefined) => {
        if (!fp) return;
        if (node.sshHostKeyFingerprint === fp) return;
        await prisma.node.update({
          where: { id: node.id },
          data: { sshHostKeyFingerprint: fp },
        });
        node.sshHostKeyFingerprint = fp;
        logActivity({
          action: "node.ssh_host_key_trusted",
          request,
          user: admin,
          metadata: { nodeId: node.id, fingerprint: fp },
        });
      };

      const runInstall = (onChunk?: Parameters<
        typeof runRemoteDaemonInstall
      >[0]["onChunk"]) =>
        runRemoteDaemonInstall({
          sshHost: parsed.data.sshHost?.trim() || node.fqdn,
          sshPort: parsed.data.sshPort,
          sshUser: parsed.data.sshUser,
          sshPassword: parsed.data.sshPassword,
          sshPrivateKey: parsed.data.sshPrivateKey,
          knownHostKeyFingerprint: node.sshHostKeyFingerprint,
          expectedHostKeyFingerprint: parsed.data.expectedHostKeyFingerprint,
          trustHostKey: parsed.data.trustHostKey,
          replaceHostKey: parsed.data.replaceHostKey,
          installScript,
          onChunk,
        });

      const finishPayload = async (
        result: Awaited<ReturnType<typeof runRemoteDaemonInstall>>,
      ) => {
        if (result.trustedHostKeyFingerprint) {
          await persistTrustedKey(result.trustedHostKeyFingerprint);
        }
        let test: unknown = null;
        if (result.ok) {
          try {
            test = await daemonTestNode(node.id);
          } catch {
            // ignore
          }
        }
        return {
          ok: result.ok,
          message: result.ok
            ? "Daemon installed on the remote VPS"
            : result.error || "Remote install failed",
          error: result.error,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          hostKeyFingerprint: result.hostKeyFingerprint,
          hostKeyMismatch: result.hostKeyMismatch,
          hostKeyNeedsTrust: result.hostKeyNeedsTrust,
          test,
          node: await serializeNodeWithUsage(node.id).catch(() => undefined),
        };
      };

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
            if (typeof flusher.flush === "function") {
              flusher.flush();
            }
          } catch {
            // client gone
          }
        };
        try {
          const result = await runInstall((chunk) => writeLine(chunk));
          if (result.ok) {
            writeLine({
              type: "status",
              message: "Install OK — testing panel → daemon connection…",
            });
          }
          const payload = await finishPayload(result);
          writeLine({ type: "done", ...payload });
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

      const result = await runInstall();
      const payload = await finishPayload(result);

      if (!result.ok) {
        return reply
          .status(result.hostKeyNeedsTrust || result.hostKeyMismatch ? 409 : 502)
          .send(payload);
      }

      return payload;
    },
  );
}
