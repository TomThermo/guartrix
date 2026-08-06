import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import {
  isApiSessionRateLimitExempt,
  sessionRateLimitKey,
} from "./api-rate-limit.js";
import { MemoryRateLimitStore } from "../rate-limit-store.js";

function fakeReq(
  url: string,
  extras?: { apiKeyAuth?: unknown; applicationAuth?: unknown },
): FastifyRequest {
  return { url, ...extras } as FastifyRequest;
}

describe("isApiSessionRateLimitExempt", () => {
  it("exempts health, public, internal, and bearer key traffic", () => {
    expect(isApiSessionRateLimitExempt(fakeReq("/api/health"))).toBe(true);
    expect(isApiSessionRateLimitExempt(fakeReq("/api/public/invite"))).toBe(
      true,
    );
    expect(isApiSessionRateLimitExempt(fakeReq("/api/internal/x"))).toBe(true);
    expect(
      isApiSessionRateLimitExempt(
        fakeReq("/api/servers", { apiKeyAuth: { id: "k" } }),
      ),
    ).toBe(true);
    expect(isApiSessionRateLimitExempt(fakeReq("/api/servers"))).toBe(false);
  });
});

describe("sessionRateLimitKey", () => {
  it("returns null when not authenticated", () => {
    expect(sessionRateLimitKey({}, "1.2.3.4")).toBeNull();
    expect(sessionRateLimitKey({ authenticated: false }, "1.2.3.4")).toBeNull();
  });

  it("keys by userId when present (not shared NAT IP)", () => {
    expect(
      sessionRateLimitKey(
        { authenticated: true, userId: "user_a" },
        "10.0.0.1",
      ),
    ).toBe("api-session:user:user_a");
    expect(
      sessionRateLimitKey(
        { authenticated: true, userId: "user_b" },
        "10.0.0.1",
      ),
    ).toBe("api-session:user:user_b");
  });

  it("falls back to IP when authenticated without userId", () => {
    expect(
      sessionRateLimitKey({ authenticated: true }, "203.0.113.9"),
    ).toBe("api-session:ip:203.0.113.9");
  });
});

describe("session rate limit isolation", () => {
  it("does not share counters across users on the same IP", () => {
    const store = new MemoryRateLimitStore();
    const max = 2;
    const windowMs = 60_000;
    const ip = "198.51.100.1";

    const keyA = sessionRateLimitKey(
      { authenticated: true, userId: "a" },
      ip,
    )!;
    const keyB = sessionRateLimitKey(
      { authenticated: true, userId: "b" },
      ip,
    )!;

    expect(store.hit(keyA, windowMs, max).limited).toBe(false);
    expect(store.hit(keyA, windowMs, max).limited).toBe(false);
    expect(store.hit(keyA, windowMs, max).limited).toBe(true);

    // Same IP, different user — still under their own budget
    expect(store.hit(keyB, windowMs, max).limited).toBe(false);
    expect(store.hit(keyB, windowMs, max).limited).toBe(false);
    expect(store.hit(keyB, windowMs, max).limited).toBe(true);
  });
});
