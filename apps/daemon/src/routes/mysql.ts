import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConsoleMessage } from "@msm/shared";
import {
  createMysqlDatabase,
  deleteMysqlDatabase,
  dumpMysqlDatabaseToFile,
  restoreMysqlDatabaseFromFile,
  ensureMysql,
  getContainerLogs,
  getMysqlStatus,
  MYSQL_CONTAINER,
} from "@msm/node-agent";
import { isDaemonAuthorized } from "../auth.js";
import { sendJson } from "../ws-utils.js";

const mysqlCreateSchema = z.object({
  name: z.string().min(2).max(64),
  username: z.string().min(2).max(64),
  password: z.string().min(8).max(128),
  remote: z.string().min(1).max(255).optional(),
});

const mysqlDeleteSchema = z.object({
  name: z.string().min(2).max(64),
  username: z.string().min(2).max(64),
  remote: z.string().min(1).max(255).optional(),
});

/** MySQL container lifecycle + database management routes. */
export function registerMysqlRoutes(app: FastifyInstance): void {
  app.get("/mysql/status", async () => getMysqlStatus());

  app.get<{ Querystring: { tail?: string } }>("/mysql/logs", async (request) => {
    const tail = Number(request.query.tail ?? 200);
    const lines = await getContainerLogs(MYSQL_CONTAINER, tail);
    return { lines };
  });

  /** Live MySQL container logs for the admin statusline. */
  app.get("/mysql/logs/stream", { websocket: true }, (socket, request) => {
    if (!isDaemonAuthorized(request)) {
      sendJson(socket, { type: "error", message: "Unauthorized" } satisfies ConsoleMessage);
      socket.close();
      return;
    }

    const q = request.query as { tail?: string };
    const tail = Math.max(1, Math.min(2000, Number(q.tail ?? 200) || 200));

    void getContainerLogs(MYSQL_CONTAINER, tail)
      .then((lines) => {
        sendJson(socket, { type: "history", lines } satisfies ConsoleMessage);
      })
      .catch(() => {
        sendJson(socket, { type: "history", lines: [] } satisfies ConsoleMessage);
      });

    const child = spawn(
      "sudo",
      ["-n", "docker", "logs", "-f", "--tail", "0", MYSQL_CONTAINER],
      { env: { ...process.env } },
    );

    const push = (buf: Buffer) => {
      for (const line of buf.toString("utf8").split(/\r?\n/)) {
        if (line === "") continue;
        sendJson(socket, {
          type: "output",
          line,
          stream: "stdout",
        } satisfies ConsoleMessage);
      }
    };
    child.stdout.on("data", push);
    child.stderr.on("data", push);
    child.on("error", (err) => {
      sendJson(socket, {
        type: "error",
        message: err.message,
      } satisfies ConsoleMessage);
    });

    const cleanup = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });

  app.post("/mysql/ensure", async (_request, reply) => {
    try {
      const status = await ensureMysql();
      return { ok: true, mysql: status };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });

  app.post("/mysql/databases", async (request, reply) => {
    const parsed = mysqlCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const created = await createMysqlDatabase(parsed.data);
      return { ok: true, database: created };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post("/mysql/databases/delete", async (request, reply) => {
    const parsed = mysqlDeleteSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      await deleteMysqlDatabase(parsed.data);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{ Body: { name?: string } }>(
    "/mysql/databases/dump",
    async (request, reply) => {
      const name = request.body?.name?.trim();
      if (!name) return reply.status(400).send({ error: "name is required" });
      const tmp = path.join(
        os.tmpdir(),
        `guartrix-mysqldump-${name}-${Date.now()}.sql`,
      );
      try {
        await dumpMysqlDatabaseToFile(name, tmp);
        const buf = await fs.readFile(tmp);
        return reply
          .header("Content-Type", "application/sql")
          .header("Content-Length", String(buf.length))
          .header(
            "Content-Disposition",
            `attachment; filename="${name}.sql"`,
          )
          .send(buf);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
      }
    },
  );

  app.post<{ Querystring: { name?: string } }>(
    "/mysql/databases/restore",
    async (request, reply) => {
      const name = request.query.name?.trim();
      if (!name) {
        return reply.status(400).send({ error: "name query param is required" });
      }
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: "No dump uploaded" });
      const tmp = path.join(
        os.tmpdir(),
        `guartrix-mysqlrestore-${name}-${Date.now()}.sql`,
      );
      try {
        const { createWriteStream } = await import("node:fs");
        const { pipeline } = await import("node:stream/promises");
        await pipeline(file.file, createWriteStream(tmp));
        await restoreMysqlDatabaseFromFile(name, tmp);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: message });
      } finally {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
      }
    },
  );
}
