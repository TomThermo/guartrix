import { useEffect, useRef } from "react";

/** True when the document tab is visible (SSR-safe). */
export function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

/**
 * Run `tick` immediately (if visible), then on an interval while the tab is visible.
 * Pauses when `document.hidden`; resumes with an immediate tick on show.
 */
export function useVisibleInterval(tick: () => void, ms: number, enabled = true): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useEffect(() => {
    if (!enabled || ms <= 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const clear = () => {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const run = () => {
      if (!isDocumentVisible()) return;
      tickRef.current();
    };

    const start = () => {
      clear();
      if (!isDocumentVisible()) return;
      run();
      timer = setInterval(run, ms);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else clear();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms, enabled]);
}
