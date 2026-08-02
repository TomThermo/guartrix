import WebSocket from "ws";
import type { NodeStatus, ServerStatus } from "@msm/shared";
import { recordActivity } from "./activity-log.js";
import { daemonWsAuthorization, daemonWsUrl, getNodeToken } from "./daemon-client.js";
import { prisma } from "./db.js";
import { processManager } from "./process-manager.js";

type Bridge = {
  nodeId: string;
  socket: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
};

const bridges = new Map<string, Bridge>();
let stopped = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Last reachability we logged per node, so reconnect churn stays quiet. */
const loggedNodeStatus = new Map<string, NodeStatus>();

function logNodeStatus(
  nodeId: string,
  nodeName: string,
  status: Extract<NodeStatus, "ONLINE" | "OFFLINE">,
): void {
  if (loggedNodeStatus.get(nodeId) === status) return;
  const first = !loggedNodeStatus.has(nodeId);
  loggedNodeStatus.set(nodeId, status);
  // Don't announce the initial connect on panel boot as "came back online".
  if (first && status === "ONLINE") return;
  void recordActivity({
    action: status === "ONLINE" ? "node.online" : "node.offline",
    actor: "system",
    success: status === "ONLINE",
    metadata: { node: nodeName, nodeId },
  });
}

export function stopDaemonEventBridge(): void {
  stopped = true;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  for (const bridge of bridges.values()) {
    tearDownBridge(bridge, false);
  }
  bridges.clear();
}

/**
 * multi-node: one live event WebSocket per daemon node so console/status/players
 * from every node flow into the panel processManager.
 */
export async function startDaemonEventBridge(): Promise<void> {
  stopped = false;
  await refreshBridges();
  scheduleRefresh();
}

function scheduleRefresh(): void {
  if (stopped) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void refreshBridges().finally(() => scheduleRefresh());
  }, 15_000);
}

async function refreshBridges(): Promise<void> {
  if (stopped) return;
  const nodes = await prisma.node.findMany({
    select: { id: true, name: true },
  });
  const want = new Set(nodes.map((n) => n.id));

  for (const id of [...bridges.keys()]) {
    if (!want.has(id)) {
      const b = bridges.get(id)!;
      tearDownBridge(b, false);
      bridges.delete(id);
    }
  }

  for (const node of nodes) {
    if (!bridges.has(node.id)) {
      const bridge: Bridge = {
        nodeId: node.id,
        socket: null,
        reconnectTimer: null,
      };
      bridges.set(node.id, bridge);
      void connectBridge(bridge);
    } else {
      const bridge = bridges.get(node.id)!;
      if (!bridge.socket && !bridge.reconnectTimer) {
        void connectBridge(bridge);
      }
    }
  }
}

function tearDownBridge(bridge: Bridge, markOffline: boolean): void {
  if (bridge.reconnectTimer) {
    clearTimeout(bridge.reconnectTimer);
    bridge.reconnectTimer = null;
  }
  if (bridge.socket) {
    try {
      bridge.socket.removeAllListeners();
      bridge.socket.close();
    } catch {
      // ignore
    }
    bridge.socket = null;
  }
  if (markOffline) {
    void prisma.node
      .update({
        where: { id: bridge.nodeId },
        data: { status: "OFFLINE" },
      })
      .catch(() => undefined);
  }
}

async function connectBridge(bridge: Bridge): Promise<void> {
  if (stopped) return;

  const node = await prisma.node.findUnique({ where: { id: bridge.nodeId } });
  if (!node) {
    bridges.delete(bridge.nodeId);
    return;
  }
  const token = getNodeToken(node.id);
  if (!token) {
    scheduleBridgeReconnect(bridge);
    return;
  }

  if (bridge.socket) {
    try {
      bridge.socket.removeAllListeners();
      bridge.socket.close();
    } catch {
      // ignore
    }
    bridge.socket = null;
  }

  const url = daemonWsUrl(node, "/events");
  let socket: WebSocket;
  try {
    socket = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${daemonWsAuthorization(node.id, token)}`,
      },
    });
  } catch {
    scheduleBridgeReconnect(bridge);
    return;
  }
  bridge.socket = socket;

  socket.on("open", () => {
    void prisma.node
      .update({
        where: { id: node.id },
        data: { status: "ONLINE", lastSeenAt: new Date() },
      })
      .catch(() => undefined);
    logNodeStatus(node.id, node.name, "ONLINE");
  });

  socket.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as {
        type?: string;
        serverId?: string;
        status?: ServerStatus;
        errorMessage?: string | null;
        players?: string[];
        line?: string;
        stream?: "stdout" | "stderr";
        stats?: import("@msm/shared").ServerStats;
      };
      if (!msg.type || !msg.serverId) return;
      if (msg.type === "status" && msg.status) {
        processManager.applyStatus(msg.serverId, msg.status, msg.errorMessage);
      } else if (msg.type === "players" && Array.isArray(msg.players)) {
        processManager.applyPlayers(msg.serverId, msg.players);
      } else if (msg.type === "output" && typeof msg.line === "string") {
        processManager.applyOutput(
          msg.serverId,
          msg.line,
          msg.stream ?? "stdout",
        );
      } else if (msg.type === "stats" && msg.stats) {
        processManager.applyStats(msg.serverId, msg.stats);
      }
    } catch {
      // ignore malformed
    }
  });

  socket.on("close", () => {
    if (bridge.socket === socket) bridge.socket = null;
    void prisma.node
      .update({
        where: { id: node.id },
        data: { status: "OFFLINE" },
      })
      .catch(() => undefined);
    logNodeStatus(node.id, node.name, "OFFLINE");
    scheduleBridgeReconnect(bridge);
  });

  socket.on("error", () => {
    // close handler reconnects
  });
}

function scheduleBridgeReconnect(bridge: Bridge): void {
  if (stopped) return;
  if (bridge.reconnectTimer) clearTimeout(bridge.reconnectTimer);
  bridge.reconnectTimer = setTimeout(() => {
    bridge.reconnectTimer = null;
    void connectBridge(bridge);
  }, 3000);
}
