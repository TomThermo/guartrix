import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { OnlinePlayersResponse, PlayersWsMessage } from "@guartrix/shared";
import { api } from "../api";
import { useVisibleInterval } from "./useVisibleInterval";

interface OnlinePlayersContextValue {
  data: OnlinePlayersResponse | null;
  refresh: () => Promise<void>;
}

const OnlinePlayersContext = createContext<OnlinePlayersContextValue | null>(null);

const POLL_FALLBACK_MS = 8_000;
const POLL_WS_DOWN_MS = 30_000;

function applyNamesUpdate(
  prev: OnlinePlayersResponse | null,
  names: string[],
  online?: boolean,
): OnlinePlayersResponse {
  const players = [...names]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name) => ({ name, uuid: null }));
  const base = prev ?? {
    online: false,
    playersOnline: 0,
    playersMax: 0,
    players: [],
    history: [],
    source: "none" as const,
    latencyMs: null,
  };
  return {
    ...base,
    online: online ?? base.online,
    playersOnline: players.length,
    players,
    source: players.length > 0 ? "console" : base.source,
  };
}

export function OnlinePlayersProvider({
  serverId,
  enabled = true,
  children,
}: {
  serverId: string;
  enabled?: boolean;
  children: ReactNode;
}) {
  const [data, setData] = useState<OnlinePlayersResponse | null>(null);
  const wsConnectedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setData(null);
      return;
    }
    try {
      const next = await api.getOnlinePlayers(serverId);
      setData(next);
    } catch {
      // keep last known
    }
  }, [serverId, enabled]);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      wsConnectedRef.current = false;
      return;
    }

    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${window.location.host}/ws/servers/${serverId}/players`);

      ws.onopen = () => {
        wsConnectedRef.current = true;
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as PlayersWsMessage;
          if (msg.type === "snapshot") {
            setData(msg.data);
          } else if (msg.type === "players") {
            setData((prev) => applyNamesUpdate(prev, msg.players, msg.online));
          } else if (msg.type === "status") {
            setData((prev) => (prev ? { ...prev, online: msg.online } : prev));
          }
        } catch {
          // ignore malformed
        }
      };

      ws.onclose = () => {
        wsConnectedRef.current = false;
        if (!closed) {
          reconnectTimer = setTimeout(connect, 4_000);
        }
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      closed = true;
      wsConnectedRef.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [serverId, enabled]);

  useVisibleInterval(
    () => {
      if (!wsConnectedRef.current) void refresh();
    },
    POLL_FALLBACK_MS,
    enabled,
  );

  // Slow safety poll even when WS is up (history / max players from ping path).
  useVisibleInterval(() => void refresh(), POLL_WS_DOWN_MS, enabled);

  const value = useMemo(() => ({ data, refresh }), [data, refresh]);

  return <OnlinePlayersContext.Provider value={value}>{children}</OnlinePlayersContext.Provider>;
}

export function useSharedOnlinePlayers(): OnlinePlayersContextValue | null {
  return useContext(OnlinePlayersContext);
}
