import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { logActivity } from "../activity-log.js";
import { isAuthenticated, requireServerAccess } from "../auth/auth.js";
import { config, serverDir } from "../config.js";
import { updateServerProperties, readServerProperties } from "../properties.js";

function packPath(serverId: string): string {
  return path.join(serverDir(serverId), "guartrix-resource-pack.zip");
}

function packMetaPath(serverId: string): string {
  return path.join(serverDir(serverId), "guartrix-resource-pack.json");
}

interface PackMeta {
  token: string;
  sha1: string;
  updatedAt: string;
}

async function readPackMeta(serverId: string): Promise<PackMeta | null> {
  try {
    const raw = await fsp.readFile(packMetaPath(serverId), "utf8");
    const data = JSON.parse(raw) as PackMeta;
    if (!data.token || !data.sha1) return null;
    return data;
  } catch {
    return null;
  }
}

async function writePackMeta(serverId: string, meta: PackMeta): Promise<void> {
  await fsp.writeFile(packMetaPath(serverId), JSON.stringify(meta, null, 2) + "\n", "utf8");
}

async function ensurePackToken(serverId: string, sha1: string): Promise<PackMeta> {
  const existing = await readPackMeta(serverId);
  if (existing?.token && existing.sha1 === sha1) return existing;
  const meta: PackMeta = {
    token: randomBytes(24).toString("hex"),
    sha1,
    updatedAt: new Date().toISOString(),
  };
  await writePackMeta(serverId, meta);
  return meta;
}

function publicPackUrl(token: string): string {
  return `${config.publicBaseUrl.replace(/\/$/, "")}/api/public/packs/${token}.zip`;
}

async function findServerIdByPackToken(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{48}$/i.test(token)) return null; // 24 bytes hex
  const root = path.join(config.dataDir, "servers");
  let entries: string[];
  try {
    entries = await fsp.readdir(root);
  } catch {
    return null;
  }
  for (const id of entries) {
    const meta = await readPackMeta(id);
    if (meta?.token === token) return id;
  }
  return null;
}

async function sha1File(file: string): Promise<string> {
  const hash = createHash("sha1");
  const data = await fsp.readFile(file);
  hash.update(data);
  return hash.digest("hex");
}

export function registerResourcePackRoutes(app: FastifyInstance): void {
  // Public download — unguessable token (not server id)
  app.get<{ Params: { token: string } }>(
    "/api/public/packs/:token.zip",
    async (request, reply) => {
      const serverId = await findServerIdByPackToken(request.params.token);
      if (!serverId) return reply.status(404).send({ error: "Pack not found" });
      const file = packPath(serverId);
      try {
        await fsp.access(file);
      } catch {
        return reply.status(404).send({ error: "Pack not found" });
      }
      reply.header("Content-Type", "application/zip");
      reply.header("Cache-Control", "private, max-age=3600");
      reply.header("Content-Disposition", `attachment; filename="resource-pack.zip"`);
      return reply.send(fs.createReadStream(file));
    },
  );

  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.includes("/resource-pack")) return;
    if (!pathOnly.startsWith("/api/servers/")) return;
    if (!isAuthenticated(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  app.get<{ Params: { id: string } }>(
    "/api/servers/:id/resource-pack",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.read",
      });
      if (!access) return;
      const server = access.server;
      const file = packPath(server.id);
      let hasPack = false;
      let sizeBytes = 0;
      let sha1: string | null = null;
      let publicUrl = "";
      try {
        const st = await fsp.stat(file);
        hasPack = st.isFile();
        sizeBytes = st.size;
        if (hasPack) {
          sha1 = await sha1File(file);
          const meta = await ensurePackToken(server.id, sha1);
          publicUrl = publicPackUrl(meta.token);
          // Keep properties in sync if token was just created
          const props = await readServerProperties(server.id);
          if (props["resource-pack"] !== publicUrl) {
            await updateServerProperties(server.id, {
              "resource-pack": publicUrl,
              "resource-pack-sha1": sha1,
            });
          }
        }
      } catch {
        // none
      }
      const props = await readServerProperties(server.id);
      return {
        hasPack,
        sizeBytes,
        sha1,
        publicUrl,
        resourcePackUrl: props["resource-pack"] ?? "",
        requireResourcePack: props["require-resource-pack"] === "true",
        prompt: props["resource-pack-prompt"] ?? "",
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/servers/:id/resource-pack",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.update",
      });
      if (!access) return;
      const server = access.server;

      const file = await request.file();
      if (!file) return reply.status(400).send({ error: "file is required" });
      if (!/\.zip$/i.test(file.filename)) {
        return reply.status(400).send({ error: "Resource pack must be a .zip file" });
      }

      const dest = packPath(server.id);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buf = Buffer.concat(chunks);
      if (buf.length > 100 * 1024 * 1024) {
        return reply.status(400).send({ error: "File too large (max 100MB)" });
      }
      await fsp.writeFile(dest, buf);
      const sha1 = createHash("sha1").update(buf).digest("hex");
      const meta: PackMeta = {
        token: randomBytes(24).toString("hex"),
        sha1,
        updatedAt: new Date().toISOString(),
      };
      await writePackMeta(server.id, meta);
      const publicUrl = publicPackUrl(meta.token);
      await updateServerProperties(server.id, {
        "resource-pack": publicUrl,
        "resource-pack-sha1": sha1,
      });
      logActivity({
        action: "settings.resource-pack",
        request,
        user: access.user,
        server,
        metadata: { action: "uploaded", file: file.filename, sizeBytes: buf.length },
      });
      return {
        ok: true,
        sha1,
        publicUrl,
        sizeBytes: buf.length,
      };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/servers/:id/resource-pack",
    async (request, reply) => {
      const access = await requireServerAccess(request, reply, request.params.id, {
        permission: "settings.update",
      });
      if (!access) return;
      const server = access.server;
      await fsp.rm(packPath(server.id), { force: true });
      await fsp.rm(packMetaPath(server.id), { force: true });
      await updateServerProperties(server.id, {
        "resource-pack": "",
        "resource-pack-sha1": "",
        "require-resource-pack": "false",
      });
      logActivity({
        action: "settings.resource-pack",
        request,
        user: access.user,
        server,
        metadata: { action: "removed" },
      });
      return { ok: true };
    },
  );
}
