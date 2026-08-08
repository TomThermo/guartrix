import { afterEach, describe, expect, it } from "vitest";
import {
  apiOwnerRateLimitPerMin,
  requireRedisHa,
  transferAllowPanelStaging,
} from "./saas-flags.js";

const KEYS = [
  "REQUIRE_REDIS_HA",
  "PANEL_HA",
  "TRANSFER_ALLOW_PANEL_STAGING",
  "API_OWNER_RATE_LIMIT",
] as const;

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("saas-flags", () => {
  it("requireRedisHa reads REQUIRE_REDIS_HA or PANEL_HA", () => {
    expect(requireRedisHa()).toBe(false);
    process.env.REQUIRE_REDIS_HA = "1";
    expect(requireRedisHa()).toBe(true);
    delete process.env.REQUIRE_REDIS_HA;
    process.env.PANEL_HA = "true";
    expect(requireRedisHa()).toBe(true);
  });

  it("transferAllowPanelStaging defaults off", () => {
    expect(transferAllowPanelStaging()).toBe(false);
    process.env.TRANSFER_ALLOW_PANEL_STAGING = "1";
    expect(transferAllowPanelStaging()).toBe(true);
    process.env.TRANSFER_ALLOW_PANEL_STAGING = "0";
    expect(transferAllowPanelStaging()).toBe(false);
  });

  it("apiOwnerRateLimitPerMin defaults to 1800", () => {
    expect(apiOwnerRateLimitPerMin()).toBe(1800);
    process.env.API_OWNER_RATE_LIMIT = "900";
    expect(apiOwnerRateLimitPerMin()).toBe(900);
  });
});
