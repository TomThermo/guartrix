import { config } from "../../config.js";

export { planBodySchema } from "../../schemas/billing.js";

export const MOLLIE_WEBHOOK_WINDOW_MS = 60_000;
export const MOLLIE_WEBHOOK_MAX = 60;

export function mollieWebhookIpAllowed(ip: string | undefined): boolean {
  const raw = process.env.MOLLIE_WEBHOOK_IP_ALLOWLIST?.trim();
  if (!raw) return true;
  const allow = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (allow.length === 0) return true;
  const peer = (ip ?? "").trim();
  return peer.length > 0 && allow.includes(peer);
}

export function panelBase(): string {
  return config.publicBaseUrl.replace(/\/$/, "");
}

/** Only allow post-payment redirects back to this panel (blocks open redirects). */
export function safeBillingRedirectUrl(candidate: string | undefined, paymentId: string): string {
  const fallback = `${panelBase()}/account/billing?payment=${paymentId}`;
  if (!candidate) return fallback;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return fallback;
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(panelBase());
  } catch {
    return fallback;
  }
  if (url.origin !== baseUrl.origin) return fallback;
  if (url.username || url.password) return fallback;
  if (!url.pathname.startsWith("/account/billing")) return fallback;
  return url.toString();
}
