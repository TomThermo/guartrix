import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { logActivity } from "../../activity-log.js";
import { requireAdmin, verifyAccountPassword } from "../../auth/auth.js";
import { prisma } from "../../db.js";
import { daemonTestNode } from "../../nodes/daemon-client.js";
import { serializeNodeWithUsage } from "./serialize.js";

export function registerNodeAdminInstallRoutes(app: FastifyInstance): void {
  /** multi-node install snippet for a remote node (token + env + commands). */
  app.get<{ Params: { id: string } }>("/api/admin/nodes/:id/install", async (request, reply) => {
    if (!(await requireAdmin(request, reply, "nodes.write"))) return;
    const node = await prisma.node.findUnique({
      where: { id: request.params.id },
    });
    if (!node) return reply.status(404).send({ error: "Not found" });
    const { getNodeToken } = await import("../../nodes/daemon-client.js");
    const { nodePublicUrl } = await import("../../nodes/nodes.js");
    const { defaultRepoUrl, panelPublicBase, buildDaemonInstallScript } = await import(
      "../../nodes/remote-install.js"
    );
    const token = getNodeToken(node.id);
    if (!token) {
      return reply.status(409).send({
        error: "Daemon token not in vault — regenerate the token, then open install again.",
      });
    }
    const panelUrl = panelPublicBase();
    const repoUrl = defaultRepoUrl();
    const sftpPort = node.sftpPort || 2022;
    /** Connect port may be public HTTPS (443); behind a proxy the daemon still listens on 8081. */
    const listenPort = node.behindProxy ? 8081 : node.daemonPort;
    const configPath = node.isLocal ? "data/daemon.env" : "/var/lib/guartrix/daemon.env";
    const envBody = [
      `# Guartrix remote daemon — node ${node.name} (${node.id})`,
      `# Save as ${configPath}`,
      `# Panel connect URL: ${nodePublicUrl(node)}`,
      node.behindProxy
        ? `# behindProxy: panel uses HTTPS to the public host; daemon listens on ${listenPort}`
        : `# scheme=${node.scheme}`,
      `DAEMON_TOKEN=${token}`,
      `DAEMON_NODE_ID=${node.id}`,
      `DAEMON_PORT=${listenPort}`,
      `DAEMON_HOST=0.0.0.0`,
      `DATA_DIR=${node.daemonBaseDirectory || "/var/lib/guartrix"}`,
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
      daemonPort: listenPort,
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
      configPath,
      listenPort,
      installCommand,
      autoDeployCommand: installCommand,
      curlInstall,
      repoUrl,
      sshHostKeyFingerprint: node.sshHostKeyFingerprint ?? null,
      steps: [
        "Easiest: fill in SSH details below and click “Install via SSH” (panel connects and installs).",
        "First SSH: confirm the host-key fingerprint, then trust it (stored on the node).",
        "Or SSH to the VPS yourself and run the install command (curl | bash).",
        `Manual: copy daemon.env to ${configPath} on the node, then start the daemon.`,
        `Firewall: daemon ${listenPort}/tcp is restricted to the panel host when possible; keep ${sftpPort}/tcp + game ports open.`,
        "Click “Test connection” in the panel.",
      ],
    };
  });

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
        return reply.status(400).send({ error: "Local node is managed by the panel host" });
      }

      const schema = z.object({
        sshHost: z.string().min(1).max(255).optional(),
        sshPort: z.number().int().min(1).max(65535).optional().default(22),
        sshUser: z.string().min(1).max(64),
        sshPassword: z.string().min(1).max(512).optional(),
        sshPrivateKey: z.string().min(1).max(16_000).optional(),
        /** Panel account password step-up (stolen session alone is not enough). */
        panelPassword: z.string().min(1).max(512),
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
      if (!(await verifyAccountPassword(request, parsed.data.panelPassword))) {
        return reply.status(403).send({ error: "Incorrect panel password" });
      }
      if (!parsed.data.sshPassword && !parsed.data.sshPrivateKey) {
        return reply.status(400).send({ error: "Provide sshPassword and/or sshPrivateKey" });
      }

      const { getNodeToken } = await import("../../nodes/daemon-client.js");
      const { defaultRepoUrl, panelPublicBase, buildDaemonInstallScript, runRemoteDaemonInstall } =
        await import("../../nodes/remote-install.js");
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
        String((request.query as { stream?: string } | undefined)?.stream) === "1";

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

      const runInstall = (onChunk?: Parameters<typeof runRemoteDaemonInstall>[0]["onChunk"]) =>
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

      const finishPayload = async (result: Awaited<ReturnType<typeof runRemoteDaemonInstall>>) => {
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
