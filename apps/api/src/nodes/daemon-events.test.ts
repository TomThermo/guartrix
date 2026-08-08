import { describe, expect, it } from "vitest";
import { computeBridgeReconnectDelayMs } from "./daemon-events.js";

describe("computeBridgeReconnectDelayMs", () => {
  it("grows exponentially then caps", () => {
    const d0 = computeBridgeReconnectDelayMs(0, {
      baseMs: 1000,
      maxMs: 60_000,
      jitterMs: 0,
      random: () => 0,
    });
    const d3 = computeBridgeReconnectDelayMs(3, {
      baseMs: 1000,
      maxMs: 60_000,
      jitterMs: 0,
      random: () => 0,
    });
    const d10 = computeBridgeReconnectDelayMs(10, {
      baseMs: 1000,
      maxMs: 60_000,
      jitterMs: 0,
      random: () => 0,
    });
    expect(d0).toBe(1000);
    expect(d3).toBe(8000);
    expect(d10).toBe(60_000);
  });

  it("adds jitter within range", () => {
    const d = computeBridgeReconnectDelayMs(0, {
      baseMs: 1000,
      maxMs: 60_000,
      jitterMs: 500,
      random: () => 0.999,
    });
    expect(d).toBe(1499);
  });
});
