import { prisma } from "../../db.js";
import { closeFirewallPort, openFirewallPort } from "../../nodes/firewall.js";
import { readServerProperties, updateServerProperties } from "../properties.js";
import { ensurePrimaryAllocation, type AllocationProtocol } from "./ensure.js";

export async function listServerAllocationPorts(
  serverId: string,
): Promise<Array<{ port: number; protocol: AllocationProtocol }>> {
  const rows = await prisma.allocation.findMany({
    where: { serverId },
    orderBy: [{ isPrimary: "desc" }, { port: "asc" }],
  });
  if (!rows.length) {
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return [];
    const { primaryAllocationProtocol } = await import("@guartrix/shared");
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

function formatPortList(ports: Array<{ port: number; protocol: AllocationProtocol }>): string {
  return ports.map((p) => `${p.port}/${p.protocol}`).join(", ");
}

/**
 * Before start: align primary allocation, `server.properties` (`server-port`),
 * and host firewall (UFW) with `Server.port`. Returns purple console notices.
 */
export async function syncServerPortPermissionsBeforeStart(server: {
  id: string;
  nodeId: string | null;
  port: number;
  type: string;
}): Promise<{ notices: string[] }> {
  const notices: string[] = [];

  const { primaryAllocationProtocol } = await import("@guartrix/shared");
  const protocol = primaryAllocationProtocol(server.type as import("@guartrix/shared").ServerType);

  // Java / PocketMine / Nukkit read the bind port from server.properties.
  // Bedrock BDS is also patched on the daemon; keep the file in sync here too.
  try {
    const props = await readServerProperties(server.id);
    const filePort = Number.parseInt(String(props["server-port"] ?? ""), 10);
    const needsPropsFix = !Number.isFinite(filePort) || filePort !== server.port;

    if (needsPropsFix) {
      await updateServerProperties(server.id, {}, server.port);
      const from = Number.isFinite(filePort) && filePort > 0 ? String(filePort) : "(missing)";
      notices.push(
        `server.properties server-port was ${from} — updated to ${server.port} so Minecraft binds the same port as the panel (Docker publish + firewall).`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notices.push(`Could not sync server.properties server-port to ${server.port}: ${msg}`);
  }

  if (!server.nodeId) return { notices };

  const primaryBefore = await prisma.allocation.findFirst({
    where: { serverId: server.id, isPrimary: true },
  });

  const needsAllocationFix =
    !primaryBefore || primaryBefore.port !== server.port || primaryBefore.protocol !== protocol;

  await ensurePrimaryAllocation({
    serverId: server.id,
    nodeId: server.nodeId,
    port: server.port,
    protocol,
  });

  if (primaryBefore && primaryBefore.port !== server.port) {
    await closeFirewallPort(
      primaryBefore.port,
      server.nodeId,
      primaryBefore.protocol as AllocationProtocol,
    ).catch(() => undefined);
  } else if (
    primaryBefore &&
    primaryBefore.protocol !== protocol &&
    primaryBefore.port === server.port
  ) {
    await closeFirewallPort(
      primaryBefore.port,
      server.nodeId,
      primaryBefore.protocol as AllocationProtocol,
    ).catch(() => undefined);
  }

  await openServerAllocationFirewalls(server.id, server.nodeId);

  const ports = await listServerAllocationPorts(server.id);
  const portList = formatPortList(ports);

  if (needsAllocationFix) {
    notices.push(
      `Port settings were out of sync — updated the primary allocation to ${server.port}/${protocol} and adjusted the host firewall (${portList}) before starting.`,
    );
  }

  return { notices };
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
