import { nanoid } from "nanoid";
import type { PortAllocation } from "@msm/shared";
import { prisma } from "../../db.js";
import { openFirewallPort } from "../../nodes/firewall.js";

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
      throw new Error(`Port ${input.port}/${protocol} is already allocated to another server`);
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
