import { z } from "zod";
import { config } from "../../config.js";

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

export const planBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase-kebab"),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).nullable().optional(),
  priceCents: z.number().int().min(0).max(10_000_000),
  currency: z.string().trim().min(3).max(3).default("EUR"),
  maxServers: z.number().int().min(0).max(10_000),
  maxMemoryMb: z.number().int().min(0).max(10_485_760),
  maxDatabases: z.number().int().min(0).max(10_000),
  defaultMemoryMb: z.number().int().min(512).max(65536).optional(),
  defaultDiskMb: z.number().int().min(1024).max(10_485_760).optional(),
  autoCreateServer: z.boolean().optional(),
  defaultServerType: z
    .enum([
      "VANILLA",
      "PAPER",
      "FABRIC",
      "FORGE",
      "PURPUR",
      "NEOFORGE",
      "QUILT",
      "BEDROCK",
      "BEDROCK_PREVIEW",
      "POCKETMINE",
      "NUKKIT",
    ])
    .optional(),
  defaultMcVersion: z.string().trim().min(1).max(32).optional(),
  recurringInterval: z
    .string()
    .trim()
    .regex(/^\d+\s+(days?|weeks?|months?|years?)$/i)
    .nullable()
    .optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export function panelBase(): string {
  return config.publicBaseUrl.replace(/\/$/, "");
}

/** Only allow post-payment redirects back to this panel (blocks open redirects). */
export function safeBillingRedirectUrl(
  candidate: string | undefined,
  paymentId: string,
): string {
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
