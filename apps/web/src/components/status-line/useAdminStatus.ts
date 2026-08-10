import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminStatusResponse } from "@guartrix/shared";
import { api } from "../../api";

export const STATUS_REFRESH_MS = 30_000;

export function useAdminStatus(refreshMs = STATUS_REFRESH_MS) {
  const [data, setData] = useState<AdminStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await api.getAdminStatus();
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);

    const clear = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const start = () => {
      clear();
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      timerRef.current = setInterval(() => void refresh(false), refreshMs);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh(false);
        start();
      } else {
        clear();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, refreshMs]);

  return { data, loading, error, setError, refresh };
}
