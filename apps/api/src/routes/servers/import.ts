import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import type { ServerType } from "@guartrix/shared";
import { primaryAllocationProtocol } from "@guartrix/shared";
import { logActivity } from "../../activity-log.js";
import {
  assertAdminFullApiKey,
  isAuthenticated,
  requireWrite,
  getSessionUser,
} from "../../auth/auth.js";
import { prisma } from "../../db.js";
import { closeFirewallPort, openFirewallPort } from "../../nodes/firewall.js";
import { processManager } from "../../servers/process-manager.js";
import { prepareServerFiles } from "../../providers/jars.js";
import { updateServerProperties } from "../../servers/properties.js";
import { safeExtractArchive } from "@guartrix/node-agent";
import { syncLocalDirToNode, wipeServerEverywhere } from "../../servers/server-files.js";
import { serverListInclude, toMcServer } from "../../servers/serialize.js";

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

async function finishImportInBackground(opts: {
  id: string;
  nodeId: string;
  port: number;
  protocol: "tcp" | "udp";
  type: ServerType;
  mcVersion: string;
  dir: string;
  tmpArchive: string;
  uploadFilename: string;
  keepCount?: number;
  actor: { id: string; username: string };
}): Promise<void> {
  const { id, nodeId, port, protocol, dir, tmpArchive } = opts;
  const { setCreatingProgress, autoStartProvisionedServer } = await import(
    "../../servers/server-provision.js"
  );
  try {
    await setCreatingProgress(id, "Creating: extracting archive…");
    await safeExtractArchive(tmpArchive, dir);
    await fs.rm(tmpArchive, { force: true });

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const meaningful = entries.filter((e) => !e.name.startsWith("import-upload"));
    if (meaningful.length === 1 && meaningful[0]!.isDirectory()) {
      const only = path.join(dir, meaningful[0]!.name);
      const inner = await fs.readdir(only);
      const hasServerRoot = inner.some(
        (n) => n === "server.properties" || n === "world" || n === "server.jar" || n === "run.sh",
      );
      if (hasServerRoot || inner.length > 0) {
        for (const name of inner) {
          await fs.rename(path.join(only, name), path.join(dir, name));
        }
        await fs.rm(only, { recursive: true, force: true });
      }
    }

    const hasJar =
      (await fs
        .access(path.join(dir, "server.jar"))
        .then(() => true)
        .catch(() => false)) ||
      (await fs
        .access(path.join(dir, "run.sh"))
        .then(() => true)
        .catch(() => false));

    let paperBuild: number | null = null;
    let fabricLoaderVersion: string | null = null;
    let forgeVersion: string | null = null;

    if (!hasJar) {
      await setCreatingProgress(id, "Creating: downloading server files…");
      const prepared = await prepareServerFiles(opts.type, opts.mcVersion, dir, port);
      paperBuild = prepared.paperBuild ?? null;
      fabricLoaderVersion = prepared.fabricLoaderVersion ?? null;
      forgeVersion = prepared.forgeVersion ?? null;
    } else {
      await fs.writeFile(path.join(dir, "eula.txt"), "eula=true\n", "utf8").catch(() => undefined);
    }

    await fs.rm(path.join(dir, "session.lock"), { force: true }).catch(() => undefined);
    await setCreatingProgress(id, "Creating: deploying to node…");
    await syncLocalDirToNode(id, nodeId, dir);
    await updateServerProperties(id, {}, port);

    const updated = await prisma.server.update({
      where: { id },
      data: {
        paperBuild,
        fabricLoaderVersion,
        forgeVersion,
      },
      include: serverListInclude,
    });
    logActivity({
      action: "server.import",
      user: opts.actor,
      server: updated,
      metadata: {
        archive: opts.uploadFilename,
        type: updated.type,
        mcVersion: updated.mcVersion,
        port: updated.port,
        node: nodeId,
      },
    });
    const { applyInitialBackupRetention } = await import("../../servers/backup-schedule.js");
    await applyInitialBackupRetention(updated.id, opts.keepCount);
    await setCreatingProgress(id, "Creating: starting…");
    await autoStartProvisionedServer(updated.id);
    const after = await prisma.server.findUnique({
      where: { id },
      select: { status: true, errorMessage: true },
    });
    if (after?.status === "CREATING") {
      await prisma.server.update({
        where: { id },
        data: { status: "STOPPED", errorMessage: null },
      });
    } else if (after?.errorMessage?.startsWith("Creating:")) {
      await prisma.server.update({
        where: { id },
        data: { errorMessage: null },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[guartrix] background import failed for ${id}: ${message}`);
    await prisma.server
      .update({
        where: { id },
        data: { status: "ERROR", errorMessage: message },
      })
      .catch(() => undefined);
    await wipeServerEverywhere(id).catch(() => undefined);
    await prisma.server.delete({ where: { id } }).catch(() => undefined);
    await closeFirewallPort(port, nodeId, protocol).catch(() => undefined);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

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
      nodeId = await resolveCreateNodeId(user.role === "ADMIN" ? data.nodeId : undefined);
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
      await prisma.server.create({
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
      await prisma.server.delete({ where: { id } }).catch(() => undefined);
      await closeFirewallPort(data.port, nodeId, protocol).catch(() => undefined);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
      return reply.status(500).send({ error: message });
    }

    const server = await prisma.server.findUniqueOrThrow({
      where: { id },
      include: serverListInclude,
    });

    void finishImportInBackground({
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
