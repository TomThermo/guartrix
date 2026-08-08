import type { FastifyInstance } from "fastify";
import { BACKUP_TRANSFER_CHUNK_BYTES } from "@msm/shared";
import { isAuthenticated } from "../../auth/auth.js";
import { registerBackupCrudRoutes } from "./backups-crud.js";
import { isChunkUpload } from "./backups-helpers.js";
import { registerBackupScheduleRoutes } from "./backups-schedules.js";
import { registerBackupUploadRoutes } from "./backups-upload.js";

/** Backup routes (CRUD, upload, schedule). */
export function registerBackupRoutes(app: FastifyInstance): void {
  // Chunk bodies are small (≤8 MiB) — buffer them; no giant streaming uploads.
  app.addContentTypeParser(
    "application/octet-stream",
    {
      parseAs: "buffer",
      bodyLimit: BACKUP_TRANSFER_CHUNK_BYTES,
    },
    (request, body, done) => {
      if (!isChunkUpload(request)) {
        done(null, body);
        return;
      }
      done(null, body);
    },
  );

  app.addHook("preHandler", async (request, reply) => {
    const pathOnly = request.url.split("?")[0];
    if (!pathOnly.includes("/backups")) return;
    if (!pathOnly.startsWith("/api/servers/")) return;
    if (!isAuthenticated(request)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });

  registerBackupCrudRoutes(app);
  registerBackupUploadRoutes(app);
  registerBackupScheduleRoutes(app);
}
