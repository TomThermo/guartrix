import type { ServerStatus } from "./server.js";
import type { ServerStats } from "./players-console.js";

/** Multiplexed daemon `/events` WebSocket — panel bridge ingress. */
export type DaemonEventsHello = {
  type: "hello";
  daemonVersion: string;
};

export type DaemonEventServerMessage =
  | {
      type: "status";
      serverId: string;
      status: ServerStatus;
      errorMessage?: string | null;
    }
  | {
      type: "players";
      serverId: string;
      players: string[];
    }
  | {
      type: "output";
      serverId: string;
      line: string;
      stream: "stdout" | "stderr";
    }
  | { type: "stats"; serverId: string; stats: ServerStats };

export type DaemonEventMessage =
  | DaemonEventsHello
  | { type: "error"; message: string }
  | DaemonEventServerMessage;

/** Redis pub/sub fan-out between API replicas (same shapes as daemon events). */
export type PanelBusPayload =
  | {
      kind: "status";
      serverId: string;
      status: ServerStatus;
      errorMessage?: string | null;
    }
  | { kind: "players"; serverId: string; players: string[] }
  | {
      kind: "output";
      serverId: string;
      line: string;
      stream: "stdout" | "stderr";
    }
  | { kind: "stats"; serverId: string; stats: ServerStats };

export type PanelBusEvent = PanelBusPayload & { origin: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse daemon `/events` JSON without throwing. Returns null when unknown or malformed. */
export function parseDaemonEventMessage(raw: unknown): DaemonEventMessage | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;

  switch (raw.type) {
    case "hello":
      return typeof raw.daemonVersion === "string"
        ? { type: "hello", daemonVersion: raw.daemonVersion }
        : null;
    case "error":
      return typeof raw.message === "string" ? { type: "error", message: raw.message } : null;
    case "status":
      if (typeof raw.serverId !== "string" || typeof raw.status !== "string") return null;
      return {
        type: "status",
        serverId: raw.serverId,
        status: raw.status as ServerStatus,
        errorMessage:
          raw.errorMessage === undefined || raw.errorMessage === null
            ? raw.errorMessage ?? null
            : typeof raw.errorMessage === "string"
              ? raw.errorMessage
              : null,
      };
    case "players":
      if (typeof raw.serverId !== "string" || !Array.isArray(raw.players)) return null;
      if (!raw.players.every((p) => typeof p === "string")) return null;
      return { type: "players", serverId: raw.serverId, players: raw.players };
    case "output":
      if (typeof raw.serverId !== "string" || typeof raw.line !== "string") return null;
      return {
        type: "output",
        serverId: raw.serverId,
        line: raw.line,
        stream: raw.stream === "stderr" ? "stderr" : "stdout",
      };
    case "stats":
      if (typeof raw.serverId !== "string" || !isRecord(raw.stats)) return null;
      return { type: "stats", serverId: raw.serverId, stats: raw.stats as unknown as ServerStats };
    default:
      return null;
  }
}

/** True when the message carries a serverId for processManager bridge handlers. */
export function isDaemonEventServerMessage(
  msg: DaemonEventMessage,
): msg is DaemonEventServerMessage {
  return (
    msg.type === "status" ||
    msg.type === "players" ||
    msg.type === "output" ||
    msg.type === "stats"
  );
}
