import { config } from "../config.js";
import { fetchSafeWebhook } from "../safe-url.js";

/** Optional outbound webhook for external billing panels (JSON POST). */
export async function emitBillingWebhook(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const url = process.env.BILLING_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetchSafeWebhook(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "guartrix",
          event,
          panel: config.publicBaseUrl,
          ...payload,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(`[billing] webhook ${event} → ${res.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(`[billing] webhook ${event} failed:`, err instanceof Error ? err.message : err);
  }
}
