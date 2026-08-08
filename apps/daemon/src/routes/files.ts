import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import {
  compressPaths,
  createDirectory,
  decompressArchive,
  deletePath,
  deployServerArchive,
  exportServerArchive,
  listFiles,
  processManager,
  readFileContent,
  removeContainer,
  renamePath,
  resolveDownloadFile,
  saveUpload,
  streamZipPaths,
  wipeServerData,
  writeFileContent,
} from "@msm/node-agent";

/** File management routes mirroring the panel's file browser (per-server). */
export function registerFileRoutes(app: FastifyInstance): void {
  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/servers/:id/files",
    async (request, reply) => {
      try {
        return await listFiles(request.params.id, request.query.path ?? ".");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/servers/:id/files/content",
    async (request, reply) => {
      try {
        return await readFileContent(request.params.id, request.query.path ?? "");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.put<{
    Params: { id: string };
    Body: { path?: string; content?: string };
  }>("/servers/:id/files/content", async (request, reply) => {
    const filePath = request.body?.path;
    if (!filePath) return reply.status(400).send({ error: "path is required" });
    try {
      await writeFileContent(request.params.id, filePath, request.body?.content ?? "");
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { path?: string };
  }>("/servers/:id/files/mkdir", async (request, reply) => {
    const dirPath = request.body?.path?.trim();
    if (!dirPath) return reply.status(400).send({ error: "path is required" });
    try {
      await createDirectory(request.params.id, dirPath);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { from?: string; to?: string };
  }>("/servers/:id/files/rename", async (request, reply) => {
    const from = request.body?.from;
    const to = request.body?.to;
    if (!from || !to) {
      return reply.status(400).send({ error: "from and to are required" });
    }
    try {
      await renamePath(request.params.id, from, to);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.delete<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/servers/:id/files",
    async (request, reply) => {
      const filePath = request.query.path;
      if (!filePath) return reply.status(400).send({ error: "path is required" });
      try {
        await deletePath(request.params.id, filePath);
        return reply.status(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{
    Params: { id: string };
    Querystring: { path?: string };
  }>("/servers/:id/files/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: "No file uploaded" });
    try {
      const saved = await saveUpload(
        request.params.id,
        request.query.path ?? ".",
        file.filename,
        file.file,
      );
      return { ok: true, ...saved };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { path?: string } }>(
    "/servers/:id/files/download",
    async (request, reply) => {
      try {
        const info = resolveDownloadFile(request.params.id, request.query.path ?? "");
        const { createReadStream } = await import("node:fs");
        const safeName = info.fileName.replace(/"/g, "");
        return reply
          .header("Content-Type", "application/octet-stream")
          .header("Content-Length", String(info.size))
          .header("Content-Disposition", `attachment; filename="${safeName}"`)
          .send(createReadStream(info.absolute));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { paths?: string[]; destination?: string };
  }>("/servers/:id/files/compress", async (request, reply) => {
    const paths = request.body?.paths;
    const destination = request.body?.destination?.trim();
    if (!Array.isArray(paths) || !destination) {
      return reply.status(400).send({ error: "paths and destination are required" });
    }
    try {
      const result = await compressPaths(request.params.id, paths, destination);
      return { ok: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { paths?: string[] };
  }>("/servers/:id/files/download-zip", async (request, reply) => {
    const paths = request.body?.paths;
    if (!Array.isArray(paths) || paths.length === 0) {
      return reply.status(400).send({ error: "paths are required" });
    }
    try {
      const { stream } = await streamZipPaths(request.params.id, paths);
      return reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", 'attachment; filename="download.zip"')
        .send(stream);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Params: { id: string };
    Body: { path?: string; destination?: string };
  }>("/servers/:id/files/decompress", async (request, reply) => {
    const archivePath = request.body?.path?.trim();
    if (!archivePath) {
      return reply.status(400).send({ error: "path is required" });
    }
    try {
      const result = await decompressArchive(
        request.params.id,
        archivePath,
        request.body?.destination?.trim() || undefined,
      );
      return { ok: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  /** Panel pushes a prepared server tree (.tar.gz) onto this node. */
  app.post<{ Params: { id: string } }>("/servers/:id/deploy", async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: "No archive uploaded" });
    const tmp = path.join(os.tmpdir(), `guartrix-deploy-${request.params.id}-${Date.now()}.tar.gz`);
    try {
      const { createWriteStream } = await import("node:fs");
      const { pipeline } = await import("node:stream/promises");
      await pipeline(file.file, createWriteStream(tmp));
      await deployServerArchive(request.params.id, tmp);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  });

  /** Dest pulls .tar.gz from source daemon and deploys locally (no panel staging). */
  app.post<{
    Params: { id: string };
    Body: { sourceExportUrl?: string; sourceAuthorization?: string };
  }>("/servers/:id/deploy-from", async (request, reply) => {
    const sourceExportUrl = request.body?.sourceExportUrl?.trim();
    const sourceAuthorization = request.body?.sourceAuthorization?.trim();
    if (!sourceExportUrl || !sourceAuthorization) {
      return reply.status(400).send({ error: "sourceExportUrl and sourceAuthorization required" });
    }
    let parsed: URL;
    try {
      parsed = new URL(sourceExportUrl);
    } catch {
      return reply.status(400).send({ error: "Invalid sourceExportUrl" });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return reply.status(400).send({ error: "sourceExportUrl must be http(s)" });
    }
    const tmp = path.join(
      os.tmpdir(),
      `guartrix-peer-deploy-${request.params.id}-${Date.now()}.tar.gz`,
    );
    try {
      const res = await fetch(sourceExportUrl, {
        headers: { Authorization: sourceAuthorization },
        signal: AbortSignal.timeout(30 * 60 * 1000),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        return reply.status(502).send({ error: text || `Source export failed (${res.status})` });
      }
      const { createWriteStream } = await import("node:fs");
      const { pipeline } = await import("node:stream/promises");
      const { Readable } = await import("node:stream");
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
      await deployServerArchive(request.params.id, tmp);
      const st = await fs.stat(tmp).catch(() => null);
      return { ok: true, bytes: st?.size ?? null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  });

  /** Panel pulls a .tar.gz of the server data directory. */
  app.get<{ Params: { id: string } }>("/servers/:id/export", async (request, reply) => {
    const tmp = path.join(os.tmpdir(), `guartrix-export-${request.params.id}-${Date.now()}.tar.gz`);
    try {
      await exportServerArchive(request.params.id, tmp);
      const { createReadStream } = await import("node:fs");
      const st = await fs.stat(tmp);
      return reply
        .header("Content-Type", "application/gzip")
        .header("Content-Length", String(st.size))
        .header("Content-Disposition", `attachment; filename="${request.params.id}.tar.gz"`)
        .send(createReadStream(tmp));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    } finally {
      // Delay unlink until stream finishes — Fastify holds the fd
      reply.raw.on("close", () => {
        void fs.rm(tmp, { force: true }).catch(() => undefined);
      });
    }
  });

  /** Stop container (if any) and delete all server files on this node. */
  app.delete<{ Params: { id: string } }>("/servers/:id", async (request, reply) => {
    const id = request.params.id;
    try {
      if (processManager.isRunning(id)) {
        await processManager.kill(id).catch(() => undefined);
      }
      await removeContainer(id).catch(() => undefined);
      await wipeServerData(id);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });
}
