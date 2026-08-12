import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { ServerType } from "@guartrix/shared";
import { primaryAllocationProtocol } from "@guartrix/shared";
import {
  assertAdminFullApiKey,
  isAuthenticated,
  requireWrite,
  getSessionUser,
} from "../../auth/auth.js";
import { closeFirewallPort, openFirewallPort } from "../../nodes/firewall.js";
import { processManager } from "../../servers/process-manager.js";
import { wipeServerEverywhere } from "../../servers/server-files.js";
import { serverListInclude, toMcServer } from "../../servers/serialize.js";
import { runImportInBackground } from "../../services/servers-import.js";
import { createServer, deleteServer, findServerOrThrow } from "../../services/servers.js";

const SERVER_TYPES = [
  "VANILLA",
  "PAPER",
  "FABRIC",
  "FORGE",
  "PURPUR",
  "NEOFORGE",
  "QUILT",
  "BEDROCK",
  "BEDROCK_PREVIEW",
  "POCKETMINE",
  "NUKKIT",
] as const;

const metaSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(SERVER_TYPES),
  mcVersion: z.string().min(1),
  port: z.coerce.number().int().min(1024).max(65535),
  memoryMb: z.coerce.number().int().min(512).max(65536),
  diskMb: z.coerce.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.coerce.number().int().min(0).max(10_000).optional(),
  nodeId: z.string().min(1).optional(),
  keepCount: z.coerce.number().int().min(1).max(50).optional(),
});

export function registerImportRoutes(app: FastifyInstance): void {
  app.post("/api/servers/import", async (request, reply) => {
    if (!isAuthenticated(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (!(await requireWrite(request, reply))) return;
    const user = await getSessionUser(request);
    if (!user) return reply.status(401).send({ error: "Unauthorized" });

    const fields: Record<string, string> = {};
    let uploadFilename = "";
    let uploadBuf: Buffer | null = null;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === "file") {
        uploadFilename = part.filename;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        uploadBuf = Buffer.concat(chunks);
      } else {
        fields[part.fieldname] = String(part.value ?? "");
      }
    }

    if (!uploadBuf) return reply.status(400).send({ error: "archive file is required" });

    const parsed = metaSchema.safeParse(fields);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const data = parsed.data;

    try {
      const { assertCanCreateServer } = await import("../../billing/quotas.js");
      await assertCanCreateServer(user, data.memoryMb, {
        diskMb: data.diskMb ?? 10_240,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(403).send({ error: message });
    }

    if (data.nodeId && user.role !== "ADMIN") {
      return reply.status(403).send({ error: "Only admins can choose a target node" });
    }
    if (data.nodeId && user.role === "ADMIN" && !assertAdminFullApiKey(request, reply)) {
      return;
    }

    let nodeId: string;
    try {
      const { assertNodeCapacity, resolveCreateNodeId } = await import("../../nodes/nodes.js");
      nodeId = await resolveCreateNodeId(user.role === "ADMIN" ? data.nodeId : undefined, {
        memoryMb: data.memoryMb,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
      });
      await assertNodeCapacity(nodeId, data.memoryMb, {
        placement: true,
        diskMb: data.diskMb,
        cpuLimit: data.cpuLimit,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }

    const protocol = primaryAllocationProtocol(data.type);
    const free = await processManager.isPortFree(data.port, undefined, nodeId, protocol);
    if (!free) {
      return reply.status(409).send({
        error: `Port ${data.port}/${protocol} is already in use`,
      });
    }

    const id = nanoid(12);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), `guartrix-import-${id}-`));

    const { isGamePortAvailable } = await import("../../servers/game-port.js");
    if (!(await isGamePortAvailable(nodeId, data.port, data.type))) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      return reply.status(409).send({
        error: `Port ${data.port}/${protocol} is already in use`,
      });
    }

    const uploadName = uploadFilename.toLowerCase();
    const ext = uploadName.endsWith(".tar.gz")
      ? ".tar.gz"
      : uploadName.endsWith(".tgz")
        ? ".tgz"
        : uploadName.endsWith(".tar")
          ? ".tar"
          : uploadName.endsWith(".zip")
            ? ".zip"
            : "";
    if (!ext) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      return reply.status(400).send({ error: "Archive must be .zip, .tar.gz or .tar" });
    }
    const tmp = path.join(dir, `import-upload${ext}`);

    try {
      await createServer({
        data: {
          id,
          name: data.name,
          type: data.type,
          mcVersion: data.mcVersion,
          port: data.port,
          memoryMb: data.memoryMb,
          diskMb: data.diskMb ?? 10_240,
          cpuLimit: data.cpuLimit ?? 0,
          status: "CREATING",
          errorMessage: "Creating: preparing…",
          startOnBoot: true,
          ownerId: user.id,
          nodeId,
        },
      });
      await openFirewallPort(data.port, nodeId, protocol);
      const { ensurePrimaryAllocation } = await import("../../servers/allocations.js");
      await ensurePrimaryAllocation({
        serverId: id,
        nodeId,
        port: data.port,
        protocol,
      });
      await fs.writeFile(tmp, uploadBuf);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await wipeServerEverywhere(id).catch(() => undefined);
      await deleteServer({ where: { id } }).catch(() => undefined);
      await closeFirewallPort(data.port, nodeId, protocol).catch(() => undefined);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      return reply.status(500).send({ error: message });
    }

    const server = await findServerOrThrow({
      where: { id },
      include: serverListInclude,
    });

    void runImportInBackground({
      id,
      nodeId,
      port: data.port,
      protocol,
      type: data.type as ServerType,
      mcVersion: data.mcVersion,
      dir,
      tmpArchive: tmp,
      uploadFilename,
      keepCount: data.keepCount,
      actor: { id: user.id, username: user.username },
    });

    return reply.status(201).send(toMcServer(server));
  });
}
