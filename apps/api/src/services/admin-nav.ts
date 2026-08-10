import { countNodes } from "./nodes.js";
import { countServers } from "./servers.js";
import { countUsers } from "./users.js";

export type AdminNavCounts = {
  servers: number;
  nodes: number;
  users: number;
};

export async function getAdminNavCounts(): Promise<AdminNavCounts> {
  const [servers, nodes, users] = await Promise.all([
    countServers(),
    countNodes(),
    countUsers(),
  ]);
  return { servers, nodes, users };
}
