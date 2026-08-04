/**
 * Optional browser error tracking — set VITE_SENTRY_DSN at build time.
 * Matches API/daemon @sentry/node (tracesSampleRate 0.1).
 */
export async function initWebSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      environment: import.meta.env.MODE,
    });
  } catch (err) {
    console.warn("[guartrix] Web Sentry init skipped:", err);
  }
}

export async function captureWebException(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // ignore
  }
}
