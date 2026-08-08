import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    turnstile: {
      enabled: false,
      siteKey: "",
      secretKey: "",
    },
  },
}));

import { config } from "../config.js";
import { assertTurnstileToken, isTurnstileConfigured, turnstilePublicConfig } from "./turnstile.js";

afterEach(() => {
  config.turnstile.enabled = false;
  config.turnstile.siteKey = "";
  config.turnstile.secretKey = "";
  vi.unstubAllGlobals();
});

describe("turnstile helpers", () => {
  it("is off when toggle or keys missing", () => {
    expect(isTurnstileConfigured()).toBe(false);
    expect(turnstilePublicConfig()).toEqual({
      turnstileEnabled: false,
      turnstileSiteKey: null,
    });

    config.turnstile.enabled = true;
    config.turnstile.siteKey = "site";
    expect(isTurnstileConfigured()).toBe(false);
  });

  it("exposes site key only when fully configured", () => {
    config.turnstile.enabled = true;
    config.turnstile.siteKey = "0x4AAAA-site";
    config.turnstile.secretKey = "0x4AAAA-secret";
    expect(isTurnstileConfigured()).toBe(true);
    expect(turnstilePublicConfig()).toEqual({
      turnstileEnabled: true,
      turnstileSiteKey: "0x4AAAA-site",
    });
  });

  it("skips verify when disabled", async () => {
    await expect(assertTurnstileToken(undefined)).resolves.toBeNull();
  });

  it("skips verify when enabled without keys (do not lock login)", async () => {
    config.turnstile.enabled = true;
    await expect(assertTurnstileToken("token")).resolves.toBeNull();
    await expect(assertTurnstileToken(undefined)).resolves.toBeNull();
  });

  it("requires a token when configured", async () => {
    config.turnstile.enabled = true;
    config.turnstile.siteKey = "site";
    config.turnstile.secretKey = "secret";
    const err = await assertTurnstileToken("");
    expect(err).toMatch(/bot check/i);
  });

  it("accepts a successful siteverify response", async () => {
    config.turnstile.enabled = true;
    config.turnstile.siteKey = "site";
    config.turnstile.secretKey = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: true }),
      })),
    );
    await expect(assertTurnstileToken("ok-token", "1.2.3.4")).resolves.toBeNull();
  });

  it("rejects a failed siteverify response", async () => {
    config.turnstile.enabled = true;
    config.turnstile.siteKey = "site";
    config.turnstile.secretKey = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }),
      })),
    );
    const err = await assertTurnstileToken("bad");
    expect(err).toMatch(/Bot check failed/i);
  });
});
