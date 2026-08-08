import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  assertCsrfToken,
  assertSameOrigin,
  CSRF_HEADER,
  ensureSessionCsrfToken,
  issueSessionCsrfToken,
  registerCsrfGuard,
} from "./csrf.js";

function req(
  headers: Record<string, string | undefined>,
  session?: { csrfToken?: string; authenticated?: boolean },
  extras?: Partial<FastifyRequest>,
): FastifyRequest {
  return { headers, session, ...extras } as FastifyRequest;
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

describe("assertSameOrigin", () => {
  it("rejects missing Origin/Referer by default", () => {
    expect(assertSameOrigin(req({}))).toBe("Missing origin");
  });

  it("allows localhost / 127.0.0.1 panel origins", () => {
    expect(assertSameOrigin(req({ origin: "http://127.0.0.1:5173" }))).toBeNull();
    expect(assertSameOrigin(req({ origin: "http://localhost" }))).toBeNull();
    expect(assertSameOrigin(req({ origin: "https://localhost" }))).toBeNull();
  });

  it("rejects unknown Origin", () => {
    expect(assertSameOrigin(req({ origin: "https://evil.example" }))).toBe("Invalid origin");
  });

  it("checks Referer origin when Origin is absent", () => {
    expect(assertSameOrigin(req({ referer: "http://127.0.0.1:5173/servers" }))).toBeNull();
    expect(assertSameOrigin(req({ referer: "https://evil.example/phish" }))).toBe(
      "Invalid referer",
    );
    expect(assertSameOrigin(req({ referer: "not-a-url" }))).toBe("Invalid referer");
  });

  it("allows missing Origin when CSRF_ALLOW_MISSING_ORIGIN=1", () => {
    const prev = process.env.CSRF_ALLOW_MISSING_ORIGIN;
    process.env.CSRF_ALLOW_MISSING_ORIGIN = "1";
    try {
      expect(assertSameOrigin(req({}))).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.CSRF_ALLOW_MISSING_ORIGIN;
      else process.env.CSRF_ALLOW_MISSING_ORIGIN = prev;
    }
  });
});

describe("registerCsrfGuard", () => {
  afterEach(() => {
    delete process.env.CSRF_ALLOW_MISSING_ORIGIN;
  });

  it("skips non-mutating, non-api, and exempt paths", async () => {
    const { app, run } = mockApp();
    registerCsrfGuard(app);
    expect(await run(req({}, undefined, { method: "GET", url: "/api/servers" }))).toBeUndefined();
    expect(await run(req({}, undefined, { method: "POST", url: "/not-api" }))).toBeUndefined();
    expect(await run(req({}, undefined, { method: "POST", url: "/api/health" }))).toBeUndefined();
    expect(await run(req({}, undefined, { method: "POST", url: "/api/ready" }))).toBeUndefined();
    expect(await run(req({}, undefined, { method: "POST", url: "/api/metrics" }))).toBeUndefined();
    expect(await run(req({}, undefined, { method: "POST", url: "/metrics" }))).toBeUndefined();
    expect(
      await run(req({}, undefined, { method: "POST", url: "/api/internal/x" })),
    ).toBeUndefined();
    expect(await run(req({}, undefined, { method: "POST", url: "/api/public/y" }))).toBeUndefined();
  });

  it("skips bearer-only clients without a cookie session", async () => {
    const { app, run } = mockApp();
    registerCsrfGuard(app);
    expect(
      await run(
        req({}, { authenticated: false }, {
          method: "POST",
          url: "/api/servers",
          apiKeyAuth: { id: "k" },
        } as Partial<FastifyRequest>),
      ),
    ).toBeUndefined();
  });

  it("rejects bad origin and missing CSRF on authenticated sessions", async () => {
    const { app, run } = mockApp();
    registerCsrfGuard(app);
    const badOrigin = await run(
      req(
        { origin: "https://evil.example" },
        { authenticated: true, csrfToken: "tok" },
        { method: "POST", url: "/api/servers" },
      ),
    );
    expect(badOrigin?.statusCode).toBe(403);

    const missingCsrf = await run(
      req(
        { origin: "http://127.0.0.1:5173" },
        { authenticated: true, csrfToken: "tok" },
        { method: "DELETE", url: "/api/servers/1" },
      ),
    );
    expect(missingCsrf?.statusCode).toBe(403);

    const okLogin = await run(
      req({ origin: "http://127.0.0.1:5173" }, {}, { method: "POST", url: "/api/auth/login" }),
    );
    expect(okLogin).toBeUndefined();

    const okToken = await run(
      req(
        { origin: "http://127.0.0.1:5173", [CSRF_HEADER]: "tok" },
        { authenticated: true, csrfToken: "tok" },
        { method: "POST", url: "/api/servers" },
      ),
    );
    expect(okToken).toBeUndefined();
  });

  it("skips CSRF token check on auth bootstrap routes", async () => {
    const { app, run } = mockApp();
    registerCsrfGuard(app);
    for (const path of [
      "/api/auth/login/2fa",
      "/api/auth/register",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/verify-email",
    ]) {
      expect(
        await run(
          req(
            { origin: "http://127.0.0.1:5173" },
            { authenticated: true, csrfToken: "tok" },
            { method: "POST", url: path },
          ),
        ),
      ).toBeUndefined();
    }
  });
});

describe("CSRF token", () => {
  it("issues stable session token", () => {
    const session: { csrfToken?: string } = {};
    const a = issueSessionCsrfToken(session);
    const b = issueSessionCsrfToken(session);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });

  it("persists newly issued CSRF via session.save", async () => {
    let saves = 0;
    const request = {
      session: {
        csrfToken: undefined as string | undefined,
        save: async () => {
          saves += 1;
        },
      },
    } as unknown as FastifyRequest;
    const token = await ensureSessionCsrfToken(request);
    expect(token.length).toBeGreaterThan(20);
    expect(saves).toBe(1);
    const again = await ensureSessionCsrfToken(request);
    expect(again).toBe(token);
    expect(saves).toBe(1);
  });

  it("validates matching header", () => {
    const session = { csrfToken: "abc123", authenticated: true };
    expect(assertCsrfToken(req({ [CSRF_HEADER]: "abc123" }, session))).toBeNull();
  });

  it("rejects mismatch", () => {
    const session = { csrfToken: "abc123", authenticated: true };
    expect(assertCsrfToken(req({ [CSRF_HEADER]: "wrong" }, session))).toBe("Invalid CSRF token");
  });

  it("rejects missing header and missing session token", () => {
    expect(assertCsrfToken(req({}, { authenticated: true }))).toMatch(/Missing CSRF/i);
    const session = { csrfToken: "abc123", authenticated: true };
    expect(assertCsrfToken(req({}, session))).toBe("Invalid CSRF token");
  });

  it("accepts long random tokens with constant-time compare path", () => {
    const session: { csrfToken?: string; authenticated?: boolean } = {
      authenticated: true,
    };
    const token = issueSessionCsrfToken(session);
    expect(assertCsrfToken(req({ [CSRF_HEADER]: token }, session))).toBeNull();
    expect(assertCsrfToken(req({ [CSRF_HEADER]: `${token}x` }, session))).toBe(
      "Invalid CSRF token",
    );
  });
});
