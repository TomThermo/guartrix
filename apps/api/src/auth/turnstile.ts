/**
 * Cloudflare Turnstile server-side verification.
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
import { config } from "../config.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileConfigured(): boolean {
  return Boolean(
    config.turnstile.enabled &&
      config.turnstile.siteKey.trim() &&
      config.turnstile.secretKey.trim(),
  );
}

/** Public shape for GET /api/auth/config (never includes secret). */
export function turnstilePublicConfig(): {
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
} {
  if (!isTurnstileConfigured()) {
    return { turnstileEnabled: false, turnstileSiteKey: null };
  }
  return {
    turnstileEnabled: true,
    turnstileSiteKey: config.turnstile.siteKey,
  };
}

/**
 * When Turnstile is fully configured, require a valid token.
 * Returns an error message or null when OK / not required.
 *
 * Incomplete config (toggle on, keys missing) is treated as off so login is
 * never locked out — same rule as turnstilePublicConfig / the login widget.
 */
export async function assertTurnstileToken(
  token: string | undefined | null,
  remoteip?: string,
): Promise<string | null> {
  if (!isTurnstileConfigured()) {
    if (config.turnstile.enabled) {
      console.warn("[guartrix] Turnstile enabled but site/secret key missing — bot check skipped");
    }
    return null;
  }

  const trimmed = String(token ?? "").trim();
  if (!trimmed) {
    return "Please complete the bot check (I'm not a robot).";
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", config.turnstile.secretKey);
    body.set("response", trimmed);
    if (remoteip) body.set("remoteip", remoteip);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return "Bot check failed — try again.";
    }
    const data = (await res.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (!data.success) {
      return "Bot check failed — try again.";
    }
    return null;
  } catch {
    return "Bot check temporarily unavailable — try again.";
  }
}
