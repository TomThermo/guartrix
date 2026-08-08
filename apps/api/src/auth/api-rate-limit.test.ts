import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  isApiSessionRateLimitExempt,
  isApiSessionReadPoll,
  registerApiSessionRateLimit,
  sessionRateLimitKey,
} from "./api-rate-limit.js";
import { MemoryRateLimitStore, setActiveRateLimitStore } from "../rate-limit-store.js";

function fakeReq(
  url: string,
  extras?: {
    method?: string;
    apiKeyAuth?: unknown;
    applicationAuth?: unknown;
    session?: { authenticated?: boolean; userId?: string };
    ip?: string;
  },
): FastifyRequest {
  return { url, method: extras?.method ?? "GET", ...extras } as FastifyRequest;
}

function mockApp(): {
  app: FastifyInstance;
  run: (request: FastifyRequest) => Promise<{ statusCode?: number; body?: unknown } | undefined>;
} {
  let hook: ((request: FastifyRequest, reply: FastifyReply) => Promise<unknown>) | undefined;
  const app = {
    addHook: (
      _name: string,
      fn: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
    ) => {
      hook = fn;
    },
  } as unknown as FastifyInstance;
  return {
    app,
    run: async (request) => {
      let sent: { statusCode?: number; body?: unknown } | undefined;
      const reply = {
        status(code: number) {
          sent = { ...(sent ?? {}), statusCode: code };
          return this;
        },
        send(body: unknown) {
          sent = { ...(sent ?? {}), body };
          return sent;
        },
      } as unknown as FastifyReply;
      await hook!(request, reply);
      return sent;
    },
  };
}

describe("isApiSessionReadPoll", () => {
  it("matches dashboard list/stats GETs only", () => {
    expect(isApiSessionReadPoll(fakeReq("/api/servers"))).toBe(true);
    expect(isApiSessionReadPoll(fakeReq("/api/servers/stats"))).toBe(true);
    expect(isApiSessionReadPoll(fakeReq("/api/servers/abc/stats/history"))).toBe(true);
    expect(isApiSessionReadPoll(fakeReq("/api/servers", { method: "POST" }))).toBe(false);
    expect(isApiSessionReadPoll(fakeReq("/api/servers/abc/backups"))).toBe(false);
  });
});

describe("isApiSessionRateLimitExempt", () => {
  it("exempts health, public, internal, and bearer key traffic", () => {
    expect(isApiSessionRateLimitExempt(fakeReq("/not-api"))).toBe(true);
    expect(isApiSessionRateLimitExempt(fakeReq("/api/health"))).toBe(true);
    expect(isApiSessionRateLimitExempt(fakeReq("/api/ready"))).toBe(true);
    expect(isApiSessionRateLimitExempt(fakeReq("/api/metrics"))).toBe(true);
    expect(isApiSessionRateLimitExempt(fakeReq("/api/public/invite"))).toBe(true);
    expect(isApiSessionRateLimitExempt(fakeReq("/api/internal/x"))).toBe(true);
    expect(isApiSessionRateLimitExempt(fakeReq("/api/servers", { apiKeyAuth: { id: "k" } }))).toBe(
      true,
    );
    expect(
      isApiSessionRateLimitExempt(fakeReq("/api/servers", { applicationAuth: { id: "a" } })),
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
    expect(sessionRateLimitKey({ authenticated: true, userId: "user_a" }, "10.0.0.1")).toBe(
      "api-session:user:user_a",
    );
    expect(sessionRateLimitKey({ authenticated: true, userId: "user_b" }, "10.0.0.1", "read")).toBe(
      "api-session-read:user:user_b",
    );
  });

  it("falls back to IP when authenticated without userId", () => {
    expect(sessionRateLimitKey({ authenticated: true }, "203.0.113.9")).toBe(
      "api-session:ip:203.0.113.9",
    );
    expect(sessionRateLimitKey({ authenticated: true }, "")).toBe("api-session:ip:unknown");
  });
});

describe("session rate limit isolation", () => {
  it("does not share counters across users on the same IP", () => {
    const store = new MemoryRateLimitStore();
    const max = 2;
    const windowMs = 60_000;
    const ip = "198.51.100.1";

    const keyA = sessionRateLimitKey({ authenticated: true, userId: "a" }, ip)!;
    const keyB = sessionRateLimitKey({ authenticated: true, userId: "b" }, ip)!;

    expect(store.hit(keyA, windowMs, max).limited).toBe(false);
    expect(store.hit(keyA, windowMs, max).limited).toBe(false);
    expect(store.hit(keyA, windowMs, max).limited).toBe(true);

    // Same IP, different user — still under their own budget
    expect(store.hit(keyB, windowMs, max).limited).toBe(false);
    expect(store.hit(keyB, windowMs, max).limited).toBe(false);
    expect(store.hit(keyB, windowMs, max).limited).toBe(true);
  });
});

describe("registerApiSessionRateLimit", () => {
  const prevMax = process.env.API_SESSION_RATE_LIMIT;

  afterEach(() => {
    if (prevMax === undefined) delete process.env.API_SESSION_RATE_LIMIT;
    else process.env.API_SESSION_RATE_LIMIT = prevMax;
    setActiveRateLimitStore(new MemoryRateLimitStore());
  });

  it("skips exempt and unauthenticated requests", async () => {
    const store = new MemoryRateLimitStore();
    setActiveRateLimitStore(store);
    const { app, run } = mockApp();
    registerApiSessionRateLimit(app);
    expect(await run(fakeReq("/api/health"))).toBeUndefined();
    expect(
      await run(
        fakeReq("/api/servers", {
          session: { authenticated: false },
          ip: "1.2.3.4",
        }),
      ),
    ).toBeUndefined();
  });

  it("returns 429 when the session budget is exhausted", async () => {
    process.env.API_SESSION_RATE_LIMIT = "2";
    // Re-import would keep MAX from module load — exercise via store with low max
    // by hitting the store directly through the hook when MAX was set at import.
    // Module MAX is fixed at load time; use a store that always limits.
    const store: {
      hit: () => { limited: true; remaining: 0 };
      clear: () => void;
    } = {
      hit: () => ({ limited: true, remaining: 0 }),
      clear: () => undefined,
    };
    setActiveRateLimitStore(store as unknown as MemoryRateLimitStore);
    const { app, run } = mockApp();
    registerApiSessionRateLimit(app);
    const sent = await run(
      fakeReq("/api/servers", {
        session: { authenticated: true, userId: "u1" },
        ip: "203.0.113.1",
      }),
    );
    expect(sent?.statusCode).toBe(429);
  });
});
