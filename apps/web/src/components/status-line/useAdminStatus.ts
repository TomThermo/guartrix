import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminStatusResponse } from "@msm/shared";
import { api } from "../../api";

export const STATUS_REFRESH_MS = 10_000;

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
    timerRef.current = setInterval(() => void refresh(false), refreshMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh, refreshMs]);

  return { data, loading, error, setError, refresh };
}
