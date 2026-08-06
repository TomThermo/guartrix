import type { FastifyInstance } from "fastify";
import { registerNodeRoutes } from "./nodes.js";
import { registerSftpAuthRoutes } from "./sftp-auth.js";

export { registerNodeRoutes, registerSftpAuthRoutes };

/** Node management + daemon SFTP auth callback. */
export function registerNodeHttpRoutes(app: FastifyInstance): void {
  registerSftpAuthRoutes(app);
  registerNodeRoutes(app);
}
