import type { ServerType } from "@guartrix/shared";
import { defaultGamePortForType, primaryAllocationProtocol } from "@guartrix/shared";
import { prisma } from "../db.js";
import { processManager } from "./process-manager.js";

const JAVA_PORT_START = 25565;
const JAVA_PORT_END = 25999;
const BEDROCK_PORT_START = 19132;
const BEDROCK_PORT_END = 19331;

/** Next free primary game port on a node for the given server type (TCP/UDP aware). */
export async function pickFreeGamePort(nodeId: string, type: ServerType): Promise<number> {
  const protocol = primaryAllocationProtocol(type);
  const freeAlloc = await prisma.allocation.findFirst({
    where: { nodeId, serverId: null, protocol },
    orderBy: { port: "asc" },
  });
  if (freeAlloc) return freeAlloc.port;

  const start = protocol === "udp" ? BEDROCK_PORT_START : JAVA_PORT_START;
  const end = protocol === "udp" ? BEDROCK_PORT_END : JAVA_PORT_END;
  const preferred = defaultGamePortForType(type);

  if (await processManager.isPortFree(preferred, undefined, nodeId, protocol)) {
    return preferred;
  }
  for (let port = start; port <= end; port += 1) {
    if (port === preferred) continue;
    if (await processManager.isPortFree(port, undefined, nodeId, protocol)) {
      return port;
    }
  }
  throw new Error(`No free ${protocol.toUpperCase()} port available on the selected node`);
}

export async function isGamePortAvailable(
  nodeId: string,
  port: number,
  type: ServerType,
): Promise<boolean> {
  const protocol = primaryAllocationProtocol(type);
  return processManager.isPortFree(port, undefined, nodeId, protocol);
}
