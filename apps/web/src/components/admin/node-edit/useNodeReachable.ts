import { useEffect, useState } from "react";

/** Tiny client-side reachability probe (opaque fetch). */
export function useNodeReachable(url: string): "loading" | "online" | "offline" {
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    void fetch(url, { mode: "no-cors", signal: ctrl.signal })
      .then(() => {
        if (!cancelled) setStatus("online");
      })
      .catch(() => {
        if (!cancelled) setStatus("offline");
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [url]);

  return status;
}
