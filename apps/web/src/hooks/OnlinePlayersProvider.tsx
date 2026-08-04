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

/**
 * Polling-only for now: the per-server console WebSocket already carries
 * `players` events internally (see `processManager.applyPlayers` /
 * `apps/api/src/daemon-events.ts`), but it is only forwarded to the browser
 * over `/ws/servers/:id/console`, which requires the `control.console`
 * permission. Sub-users can hold `player.read` without `control.console`,
 * so reusing that socket here would silently break online-player tracking
 * for them. A dedicated players WS (gated on `player.read`) would fix this
 * but is a larger, separate change — see improvement map item #21.
 *
 * In the meantime `useVisibleInterval` already fully pauses polling while
 * the tab is hidden (stronger than merely slowing it down), so background
 * tabs don't spend extra requests.
 */
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
