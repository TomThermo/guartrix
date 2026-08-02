import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { OnlinePlayersResponse } from "@msm/shared";
import { api } from "../api";
import { useVisibleInterval } from "./useVisibleInterval";

interface OnlinePlayersContextValue {
  data: OnlinePlayersResponse | null;
  refresh: () => Promise<void>;
}

const OnlinePlayersContext = createContext<OnlinePlayersContextValue | null>(
  null,
);

const POLL_MS = 8_000;

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

  useVisibleInterval(() => void refresh(), POLL_MS, enabled);

  const value = useMemo(() => ({ data, refresh }), [data, refresh]);

  return (
    <OnlinePlayersContext.Provider value={value}>
      {children}
    </OnlinePlayersContext.Provider>
  );
}

export function useSharedOnlinePlayers(): OnlinePlayersContextValue | null {
  return useContext(OnlinePlayersContext);
}
