import { nanoid } from "nanoid";
import { prisma } from "../../db.js";
import { ensurePrimaryAllocation, type AllocationProtocol } from "./ensure.js";

export async function createNodeAllocationRange(input: {
  nodeId: string;
  portStart: number;
  portEnd: number;
  protocol: AllocationProtocol;
  ip?: string;
  notes?: string;
}): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (let port = input.portStart; port <= input.portEnd; port += 1) {
    const exists = await prisma.allocation.findUnique({
      where: {
        nodeId_port_protocol: {
          nodeId: input.nodeId,
          port,
          protocol: input.protocol,
        },
      },
    });
    if (exists) {
      skipped += 1;
      continue;
    }
    // Also skip if a server already owns this as primary game port (legacy)
    const serverOnPort = await prisma.server.findFirst({
      where: { nodeId: input.nodeId, port },
      select: { id: true, type: true },
    });
    if (serverOnPort) {
      const { primaryAllocationProtocol } = await import("@guartrix/shared");
      if (primaryAllocationProtocol(serverOnPort.type) === input.protocol) {
        await ensurePrimaryAllocation({
          serverId: serverOnPort.id,
          nodeId: input.nodeId,
          port,
          ip: input.ip,
          protocol: input.protocol,
        });
        skipped += 1;
        continue;
      }
    }
    await prisma.allocation.create({
      data: {
        id: nanoid(12),
        nodeId: input.nodeId,
        port,
        protocol: input.protocol,
        ip: input.ip ?? "0.0.0.0",
        notes: input.notes ?? null,
        serverId: null,
        isPrimary: false,
      },
    });
    created += 1;
  }
  return { created, skipped };
}
