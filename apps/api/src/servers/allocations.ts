import { nanoid } from "nanoid";
import type { PortAllocation } from "@msm/shared";
import { prisma } from "../db.js";
import { closeFirewallPort, openFirewallPort } from "../nodes/firewall.js";

export type AllocationProtocol = "tcp" | "udp";

export function serializeAllocation(row: {
  id: string;
  nodeId: string;
  ip: string;
  port: number;
  protocol: string;
  notes: string | null;
  serverId: string | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
  server?: { name: string } | null;
}): PortAllocation {
  return {
    id: row.id,
    nodeId: row.nodeId,
    ip: row.ip,
    port: row.port,
    protocol: row.protocol === "udp" ? "udp" : "tcp",
    notes: row.notes,
    serverId: row.serverId,
    serverName: row.server?.name ?? null,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensurePrimaryAllocation(input: {
  serverId: string;
  nodeId: string;
  port: number;
  ip?: string;
  protocol?: AllocationProtocol;
}): Promise<void> {
  const protocol = input.protocol ?? "tcp";
  const existing = await prisma.allocation.findFirst({
    where: { serverId: input.serverId, isPrimary: true },
  });
  if (existing) {
    if (
      existing.port !== input.port ||
      existing.nodeId !== input.nodeId ||
      existing.protocol !== protocol
    ) {
      await prisma.allocation.update({
        where: { id: existing.id },
        data: {
          nodeId: input.nodeId,
          port: input.port,
          protocol,
          ip: input.ip ?? existing.ip,
          isPrimary: true,
          serverId: input.serverId,
        },
      });
    }
    return;
  }

  const clash = await prisma.allocation.findUnique({
    where: {
      nodeId_port_protocol: {
        nodeId: input.nodeId,
        port: input.port,
        protocol,
      },
    },
  });
  if (clash) {
    if (clash.serverId && clash.serverId !== input.serverId) {
      throw new Error(
        `Port ${input.port}/${protocol} is already allocated to another server`,
      );
    }
    await prisma.allocation.update({
      where: { id: clash.id },
      data: {
        serverId: input.serverId,
        isPrimary: true,
        ip: input.ip ?? clash.ip,
      },
    });
    // Clear other primary flags for this server
    await prisma.allocation.updateMany({
      where: {
        serverId: input.serverId,
        isPrimary: true,
        NOT: { id: clash.id },
      },
      data: { isPrimary: false },
    });
    return;
  }

  await prisma.allocation.create({
    data: {
      id: nanoid(12),
      nodeId: input.nodeId,
      port: input.port,
      protocol,
      ip: input.ip ?? "0.0.0.0",
      serverId: input.serverId,
      isPrimary: true,
    },
  });
}

/** Ensure a non-primary UDP allocation exists for the same port on this server. */
export async function ensureUdpCompanion(opts: {
  serverId: string;
  nodeId: string;
  port: number;
  notes?: string | null;
}): Promise<void> {
  const existing = await prisma.allocation.findUnique({
    where: {
      nodeId_port_protocol: {
        nodeId: opts.nodeId,
        port: opts.port,
        protocol: "udp",
      },
    },
  });
  if (existing?.serverId && existing.serverId !== opts.serverId) {
    throw new Error(`UDP port ${opts.port} is already used by another server`);
  }
  if (existing) {
    if (existing.serverId !== opts.serverId) {
      await prisma.allocation.update({
        where: { id: existing.id },
        data: {
          serverId: opts.serverId,
          isPrimary: false,
          notes: opts.notes ?? existing.notes ?? "UDP companion",
        },
      });
    }
  } else {
    await prisma.allocation.create({
      data: {
        id: nanoid(12),
        nodeId: opts.nodeId,
        port: opts.port,
        protocol: "udp",
        ip: "0.0.0.0",
        notes: opts.notes ?? "UDP companion (query / Geyser)",
        serverId: opts.serverId,
        isPrimary: false,
      },
    });
  }
  await openFirewallPort(opts.port, opts.nodeId, "udp").catch(() => undefined);
}

/** Backfill primary allocations for servers that lack one. */
export async function migratePrimaryAllocations(): Promise<number> {
  const { primaryAllocationProtocol } = await import("@msm/shared");
  const servers = await prisma.server.findMany({
    where: { nodeId: { not: null } },
    select: { id: true, nodeId: true, port: true, type: true },
  });
  let n = 0;
  for (const s of servers) {
    if (!s.nodeId) continue;
    const has = await prisma.allocation.findFirst({
      where: { serverId: s.id, isPrimary: true },
    });
    if (has) continue;
    try {
      await ensurePrimaryAllocation({
        serverId: s.id,
        nodeId: s.nodeId,
        port: s.port,
        protocol: primaryAllocationProtocol(s.type),
      });
      n += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[guartrix] Could not backfill allocation for ${s.id}: ${msg}`,
      );
    }
  }
  return n;
}

/** Fix Bedrock servers whose primary allocation or firewall still use TCP. */
export async function migrateBedrockAllocationProtocols(): Promise<number> {
  const { primaryAllocationProtocol } = await import("@msm/shared");
  const servers = await prisma.server.findMany({
    where: {
      nodeId: { not: null },
      type: { in: ["BEDROCK", "BEDROCK_PREVIEW", "POCKETMINE", "NUKKIT"] },
    },
    select: { id: true, nodeId: true, port: true, type: true },
  });
  let n = 0;
  for (const s of servers) {
    if (!s.nodeId) continue;
    const want = primaryAllocationProtocol(s.type);
    if (want !== "udp") continue;
    const primary = await prisma.allocation.findFirst({
      where: { serverId: s.id, isPrimary: true },
    });
    if (primary?.protocol === want) continue;
    try {
      await ensurePrimaryAllocation({
        serverId: s.id,
        nodeId: s.nodeId,
        port: s.port,
        protocol: want,
      });
      await openFirewallPort(s.port, s.nodeId, want).catch(() => undefined);
      if (primary?.protocol === "tcp") {
        await closeFirewallPort(s.port, s.nodeId, "tcp").catch(() => undefined);
      }
      n += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[guartrix] Could not fix Bedrock allocation for ${s.id}: ${msg}`,
      );
    }
  }
  return n;
}

export async function listServerAllocationPorts(serverId: string): Promise<
  Array<{ port: number; protocol: AllocationProtocol }>
> {
  const rows = await prisma.allocation.findMany({
    where: { serverId },
    orderBy: [{ isPrimary: "desc" }, { port: "asc" }],
  });
  if (!rows.length) {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return [];
    const { primaryAllocationProtocol } = await import("@msm/shared");
    return [
      {
        port: server.port,
        protocol: primaryAllocationProtocol(server.type),
      },
    ];
  }
  return rows.map((r) => ({
    port: r.port,
    protocol: (r.protocol === "udp" ? "udp" : "tcp") as AllocationProtocol,
  }));
}

export async function openServerAllocationFirewalls(
  serverId: string,
  nodeId?: string | null,
): Promise<void> {
  const ports = await listServerAllocationPorts(serverId);
  for (const p of ports) {
    await openFirewallPort(p.port, nodeId, p.protocol).catch(() => undefined);
  }
}

export async function closeServerAllocationFirewalls(
  serverId: string,
  nodeId?: string | null,
): Promise<void> {
  const ports = await listServerAllocationPorts(serverId);
  for (const p of ports) {
    await closeFirewallPort(p.port, nodeId, p.protocol).catch(() => undefined);
  }
}

/** Unassign (do not delete) all allocations for a server — keeps node port pool. */
export async function releaseServerAllocations(serverId: string): Promise<void> {
  await prisma.allocation.updateMany({
    where: { serverId },
    data: { serverId: null, isPrimary: false },
  });
}

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
      const { primaryAllocationProtocol } = await import("@msm/shared");
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
