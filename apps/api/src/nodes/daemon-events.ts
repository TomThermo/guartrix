import WebSocket from "ws";
import type { NodeStatus, ServerStatus, ServerStats } from "@msm/shared";
import { recordActivity } from "../activity-log.js";
import { daemonWsAuthorization, daemonWsUrl, getNodeToken } from "./daemon-client.js";
import { prisma } from "../db.js";
import { processManager } from "../servers/process-manager.js";
import {
  acquireBridgeLock,
  isRedisEnabled,
  onPanelBusEvent,
  startPanelEventBus,
  type PanelBusEvent,
} from "../redis.js";

type Bridge = {
  nodeId: string;
  socket: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  attempt: number;
};

const bridges = new Map<string, Bridge>();
let stopped = false;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let busUnsub: (() => void) | null = null;
/** Whether this process currently owns daemon `/events` ingress. */
let bridgeIngress = true;

/** Last reachability we logged per node, so reconnect churn stays quiet. */
const loggedNodeStatus = new Map<string, NodeStatus>();

function envInt(name: string, fallback: number, min: number, max: number): number {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function bridgeReconnectBaseMs(): number {
  return envInt("DAEMON_BRIDGE_RECONNECT_BASE_MS", 1000, 200, 30_000);
}

export function bridgeReconnectMaxMs(): number {
  return envInt("DAEMON_BRIDGE_RECONNECT_MAX_MS", 60_000, 1000, 300_000);
}

export function bridgeReconnectJitterMs(): number {
  return envInt("DAEMON_BRIDGE_RECONNECT_JITTER_MS", 1000, 0, 30_000);
}

export function bridgeConnectStaggerMs(): number {
  return envInt("DAEMON_BRIDGE_CONNECT_STAGGER_MS", 10_000, 0, 120_000);
}

/** `auto` (default) | `always` | `never` — debug overrides for bridge ownership. */
export function bridgeMode(): "auto" | "always" | "never" {
  const raw = (process.env.DAEMON_BRIDGE_MODE ?? "auto").trim().toLowerCase();
  if (raw === "always" || raw === "never") return raw;
  return "auto";
}

/** Pure delay helper (exported for tests). */
export function computeBridgeReconnectDelayMs(
  attempt: number,
  opts?: {
    baseMs?: number;
    maxMs?: number;
    jitterMs?: number;
    random?: () => number;
  },
): number {
  const base = opts?.baseMs ?? bridgeReconnectBaseMs();
  const max = opts?.maxMs ?? bridgeReconnectMaxMs();
  const jitter = opts?.jitterMs ?? bridgeReconnectJitterMs();
  const rnd = opts?.random ?? Math.random;
  const exp = Math.min(Math.max(0, Math.floor(attempt)), 6);
  const core = Math.min(max, base * 2 ** exp);
  const jitterAdd = jitter > 0 ? Math.floor(rnd() * jitter) : 0;
  return Math.min(max, core + jitterAdd);
}

function staggerOffsetMs(nodeId: string): number {
  const window = bridgeConnectStaggerMs();
  if (window <= 0) return 0;
  let h = 0;
  for (let i = 0; i < nodeId.length; i++) {
    h = (h * 31 + nodeId.charCodeAt(i)) >>> 0;
  }
  return h % window;
}

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
  bridgeIngress = false;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  if (busUnsub) {
    busUnsub();
    busUnsub = null;
  }
  for (const bridge of bridges.values()) {
    tearDownBridge(bridge, false);
  }
  bridges.clear();
}

function applyBusEvent(event: PanelBusEvent): void {
  if (event.kind === "status") {
    processManager.applyStatus(event.serverId, event.status as ServerStatus, event.errorMessage, {
      fromBus: true,
    });
  } else if (event.kind === "players") {
    processManager.applyPlayers(event.serverId, event.players, { fromBus: true });
  } else if (event.kind === "output") {
    processManager.applyOutput(event.serverId, event.line, event.stream, {
      fromBus: true,
    });
  } else if (event.kind === "stats") {
    processManager.applyStats(event.serverId, event.stats as ServerStats, { fromBus: true });
  }
}

async function shouldOwnBridges(): Promise<boolean> {
  const mode = bridgeMode();
  if (mode === "always") return true;
  if (mode === "never") return false;
  // auto: single-API always; multi-API only Redis bridge leader.
  if (!isRedisEnabled()) return true;
  return acquireBridgeLock();
}

/**
 * multi-node: one live event WebSocket per daemon node so console/status/players
 * from every node flow into the panel processManager.
 * With Redis HA: only the bridge-lock leader opens `/events`; others consume
 * `guartrix:events` fan-out (no N×R duplicate bridges).
 */
export async function startDaemonEventBridge(): Promise<void> {
  stopped = false;
  await startPanelEventBus();
  if (!busUnsub) {
    busUnsub = onPanelBusEvent(applyBusEvent);
  }
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

function tearDownAllBridgesQuiet(): void {
  for (const bridge of bridges.values()) {
    tearDownBridge(bridge, false);
  }
  bridges.clear();
}

async function refreshBridges(): Promise<void> {
  if (stopped) return;

  const own = await shouldOwnBridges();
  if (!own) {
    if (bridgeIngress) {
      tearDownAllBridgesQuiet();
    }
    bridgeIngress = false;
    return;
  }

  const gained = !bridgeIngress;
  bridgeIngress = true;

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
        attempt: 0,
      };
      bridges.set(node.id, bridge);
      // Stagger first connect (and after leadership gain) to avoid storms.
      scheduleBridgeConnect(bridge, staggerOffsetMs(node.id));
    } else {
      const bridge = bridges.get(node.id)!;
      if (!bridge.socket && !bridge.reconnectTimer) {
        const delay = gained ? staggerOffsetMs(node.id) : 0;
        scheduleBridgeConnect(bridge, delay);
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

function scheduleBridgeConnect(bridge: Bridge, delayMs?: number): void {
  if (stopped || !bridgeIngress) return;
  if (bridge.reconnectTimer) return;
  const delay = delayMs ?? computeBridgeReconnectDelayMs(bridge.attempt);
  bridge.reconnectTimer = setTimeout(() => {
    bridge.reconnectTimer = null;
    void connectBridge(bridge);
  }, delay);
  bridge.reconnectTimer.unref?.();
}

async function connectBridge(bridge: Bridge): Promise<void> {
  if (stopped || !bridgeIngress) return;

  const node = await prisma.node.findUnique({ where: { id: bridge.nodeId } });
  if (!node) {
    bridges.delete(bridge.nodeId);
    return;
  }
  const token = getNodeToken(node.id);
  if (!token) {
    bridge.attempt += 1;
    scheduleBridgeConnect(bridge);
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
      handshakeTimeout: 15_000,
    });
  } catch {
    bridge.attempt += 1;
    scheduleBridgeConnect(bridge);
    return;
  }
  bridge.socket = socket;

  socket.on("open", () => {
    bridge.attempt = 0;
    if (!bridgeIngress) return;
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
        processManager.applyOutput(msg.serverId, msg.line, msg.stream ?? "stdout");
      } else if (msg.type === "stats" && msg.stats) {
        processManager.applyStats(msg.serverId, msg.stats);
      }
    } catch {
      // ignore malformed
    }
  });

  socket.on("close", () => {
    if (bridge.socket === socket) bridge.socket = null;
    if (!bridgeIngress || stopped) return;
    void prisma.node
      .update({
        where: { id: node.id },
        data: { status: "OFFLINE" },
      })
      .catch(() => undefined);
    logNodeStatus(node.id, node.name, "OFFLINE");
    bridge.attempt += 1;
    scheduleBridgeConnect(bridge);
  });

  socket.on("error", () => {
    // close handler reconnects
  });
}
