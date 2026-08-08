import { prisma } from "../../db.js";
import { listNodesWithUsage } from "../../nodes/nodes.js";

export async function serializeNodeWithUsage(nodeId: string) {
  const nodes = await listNodesWithUsage();
  const found = nodes.find((n) => n.id === nodeId);
  if (!found) throw new Error("Node not found");
  return found;
}

export async function resolveListedNode(nodeId: string) {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return null;
  return node;
}
