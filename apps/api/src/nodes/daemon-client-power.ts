import type { DaemonServerConfig } from "@msm/node-agent";
import type { ServerStatus } from "@msm/shared";
import { prisma } from "../db.js";
import {
  DAEMON_DEFAULT_TIMEOUT_MS,
  DAEMON_POWER_TIMEOUT_MS,
  daemonJson,
  getNodeToken,
  resolveNode,
  resolveNodeForServer,
} from "./daemon-client-core.js";

export async function daemonGetSystem(nodeId?: string | null) {
  const node = await resolveNode(nodeId);
  return daemonJson<{
    totalMemoryMb: number;
    totalMemoryGb: number;
    hostname: string;
    publicIp: string | null;
    version: string;
    uptime: number;
    daemonVersion: string;
  }>(node, "/system");
}

export interface DaemonStatusSnapshot {
  hostname: string;
  publicIp: string | null;
  localIps: Array<{ iface: string; address: string }>;
  osVersion: string;
  arch: string;
  cpuCount: number;
  loadAvg: [number, number, number];
  dockerVersion: string;
  daemonVersion: string;
  daemonPid: number;
  daemonPort: number;
  daemonMemoryRssMb: number;
  uptime: number;
  totalMemoryMb: number;
  totalMemoryGb: number;
  freeMemoryMb: number;
  disk: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
    totalLabel: string;
    usedLabel: string;
    freeLabel: string;
  } | null;
  network?: {
    rxBytes: number;
    txBytes: number;
    rxLabel: string;
    txLabel: string;
  } | null;
  mysql: {
    running: boolean;
    container: string;
    image: string;
    host: string;
    port: number;
  } | null;
  sftp?: {
    port: number;
    listening: boolean;
  } | null;
  containers: Array<{
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
    createdAt: string;
    ports: string;
    serverId: string | null;
    isMysql: boolean;
    cpuPercent: number;
    memoryUsedBytes: number;
    memoryLimitBytes: number;
    memoryPercent: number;
    memoryUsedLabel: string;
    memoryLimitLabel: string;
  }>;
}

export async function daemonGetStatus(nodeId?: string | null) {
  const node = await resolveNode(nodeId);
  return daemonJson<DaemonStatusSnapshot>(node, "/status");
}

export async function daemonTestNode(nodeId: string) {
  const node = await resolveNode(nodeId);
  try {
    const system = await daemonJson<{
      totalMemoryMb: number;
      totalMemoryGb: number;
      hostname: string;
      publicIp: string | null;
      uptime: number;
      daemonVersion: string;
    }>(node, "/system");
    await prisma.node.update({
      where: { id: nodeId },
      data: {
        status: "ONLINE",
        lastSeenAt: new Date(),
        memoryMb: system.totalMemoryMb,
      },
    });
    return { ok: true as const, system };
  } catch (err) {
    await prisma.node.update({
      where: { id: nodeId },
      data: { status: "OFFLINE" },
    });
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function daemonCleanupContainers(nodeId?: string | null) {
  const node = await resolveNode(nodeId);
  return daemonJson<{ ok: boolean; removed: number }>(node, "/cleanup-containers", {
    method: "POST",
    body: "{}",
  });
}

export async function daemonPower(
  serverId: string,
  action: "start" | "stop" | "restart" | "kill",
  server?: DaemonServerConfig,
) {
  const { node } = await resolveNodeForServer(serverId);
  const timeoutMs =
    action === "start" || action === "restart"
      ? DAEMON_POWER_TIMEOUT_MS
      : DAEMON_DEFAULT_TIMEOUT_MS;
  return daemonJson<{ ok: boolean; status?: ServerStatus }>(node, `/servers/${serverId}/power`, {
    method: "POST",
    body: JSON.stringify({ action, server }),
    timeoutMs,
  });
}

/** Push panel license ticket to a node (or all known nodes when nodeId omitted). */
export async function daemonPushLicenseTicket(
  ticket: unknown,
  nodeId?: string | null,
): Promise<{ ok: boolean; mode?: string }> {
  const node = await resolveNode(nodeId);
  return daemonJson<{ ok: boolean; mode?: string }>(node, "/license/ticket", {
    method: "POST",
    body: JSON.stringify({ ticket }),
  });
}

/** Best-effort push to every node that has a vault token. */
export async function daemonPushLicenseTicketAll(
  ticket: unknown,
): Promise<{ pushed: number; failed: number }> {
  const nodes = await prisma.node.findMany({ select: { id: true } });
  let pushed = 0;
  let failed = 0;
  for (const n of nodes) {
    if (!getNodeToken(n.id)) {
      failed += 1;
      continue;
    }
    try {
      await daemonPushLicenseTicket(ticket, n.id);
      pushed += 1;
    } catch (err) {
      failed += 1;
      console.warn(
        `[license] ticket push failed for node ${n.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { pushed, failed };
}

export async function daemonSetLimits(
  serverId: string,
  limits: { diskMb: number; cpuLimit: number },
) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson<{ ok: boolean }>(node, `/servers/${serverId}/limits`, {
    method: "PUT",
    body: JSON.stringify(limits),
  });
}

export async function daemonCommand(serverId: string, command: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson<{ ok: boolean }>(node, `/servers/${serverId}/command`, {
    method: "POST",
    body: JSON.stringify({ command }),
  });
}

export async function daemonIsRunning(serverId: string): Promise<boolean> {
  const { node } = await resolveNodeForServer(serverId);
  const data = await daemonJson<{ running: boolean }>(node, `/servers/${serverId}/running`);
  return data.running;
}

export async function daemonIsPortFree(
  port: number,
  nodeId?: string | null,
  protocol: "tcp" | "udp" = "tcp",
) {
  const node = await resolveNode(nodeId);
  const data = await daemonJson<{ free: boolean }>(node, "/ports/check", {
    method: "POST",
    body: JSON.stringify({ port, protocol }),
  });
  return data.free;
}

export async function daemonChown(serverId: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson<{ ok: boolean }>(node, `/servers/${serverId}/chown`, {
    method: "POST",
    body: "{}",
  });
}

export async function daemonStats(serverId: string, includeDisk = false) {
  const { node } = await resolveNodeForServer(serverId);
  const q = includeDisk ? "?disk=1" : "";
  return daemonJson(node, `/servers/${serverId}/stats${q}`);
}

export async function daemonStatsHistory(serverId: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson<{
    samples: Array<{
      at: number;
      cpuPercent: number;
      memoryMb: number;
      networkRxBytes: number;
      networkTxBytes: number;
    }>;
  }>(node, `/servers/${serverId}/stats/history`);
}

export async function daemonDisk(serverId: string) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson(node, `/servers/${serverId}/disk`);
}

export async function daemonOnlineNames(serverId: string): Promise<string[]> {
  const { node } = await resolveNodeForServer(serverId);
  const data = await daemonJson<{ online: string[] }>(node, `/servers/${serverId}/players`);
  return data.online;
}

export async function daemonHistory(serverId: string): Promise<string[]> {
  const { node } = await resolveNodeForServer(serverId);
  const data = await daemonJson<{ lines: string[] }>(node, `/servers/${serverId}/history`);
  return data.lines;
}

export async function daemonFirewallOpen(
  port: number,
  nodeId?: string | null,
  protocol: "tcp" | "udp" = "tcp",
) {
  const node = await resolveNode(nodeId);
  return daemonJson(node, "/firewall/open", {
    method: "POST",
    body: JSON.stringify({ port, protocol }),
  });
}

export async function daemonFirewallClose(
  port: number,
  nodeId?: string | null,
  protocol: "tcp" | "udp" = "tcp",
) {
  const node = await resolveNode(nodeId);
  return daemonJson(node, "/firewall/close", {
    method: "POST",
    body: JSON.stringify({ port, protocol }),
  });
}

export async function daemonOpenFirewallForGamePort(serverId: string, port: number) {
  const { node } = await resolveNodeForServer(serverId);
  return daemonJson(node, "/firewall/open", {
    method: "POST",
    body: JSON.stringify({ port }),
  });
}
