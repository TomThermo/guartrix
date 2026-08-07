import { getRateLimitStore } from "../rate-limit-store.js";
import { apiOwnerRateLimitPerMin } from "../saas-flags.js";

const WINDOW_MS = 60_000;

/**
 * Soft aggregate cap across an owner's Client API keys + cookie session.
 * Returns an error message when limited, else null.
 */
export async function checkOwnerApiRate(userId: string): Promise<string | null> {
  const id = userId?.trim();
  if (!id) return null;
  const limit = apiOwnerRateLimitPerMin();
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const result = await getRateLimitStore().hit(`owner-api:${id}`, WINDOW_MS, limit);
  if (result.limited) {
    return `Owner API rate limit exceeded (${limit}/min)`;
  }
  return null;
}
