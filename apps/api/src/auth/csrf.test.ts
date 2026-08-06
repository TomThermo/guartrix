import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import {
  assertCsrfToken,
  assertSameOrigin,
  CSRF_HEADER,
  issueSessionCsrfToken,
} from "./csrf.js";

function req(
  headers: Record<string, string | undefined>,
  session?: { csrfToken?: string; authenticated?: boolean },
): FastifyRequest {
  return { headers, session } as FastifyRequest;
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
    expect(assertSameOrigin(req({ origin: "https://evil.example" }))).toBe(
      "Invalid origin",
    );
  });

  it("checks Referer origin when Origin is absent", () => {
    expect(
      assertSameOrigin(req({ referer: "http://127.0.0.1:5173/servers" })),
    ).toBeNull();
    expect(
      assertSameOrigin(req({ referer: "https://evil.example/phish" })),
    ).toBe("Invalid referer");
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

  it("validates matching header", () => {
    const session = { csrfToken: "abc123", authenticated: true };
    expect(
      assertCsrfToken(
        req({ [CSRF_HEADER]: "abc123" }, session),
      ),
    ).toBeNull();
  });

  it("rejects mismatch", () => {
    const session = { csrfToken: "abc123", authenticated: true };
    expect(assertCsrfToken(req({ [CSRF_HEADER]: "wrong" }, session))).toBe(
      "Invalid CSRF token",
    );
  });

  it("rejects missing header and missing session token", () => {
    expect(assertCsrfToken(req({}, { authenticated: true }))).toMatch(
      /Missing CSRF/i,
    );
    const session = { csrfToken: "abc123", authenticated: true };
    expect(assertCsrfToken(req({}, session))).toBe("Invalid CSRF token");
  });

  it("accepts long random tokens with constant-time compare path", () => {
    const session: { csrfToken?: string; authenticated?: boolean } = {
      authenticated: true,
    };
    const token = issueSessionCsrfToken(session);
    expect(assertCsrfToken(req({ [CSRF_HEADER]: token }, session))).toBeNull();
    expect(
      assertCsrfToken(req({ [CSRF_HEADER]: `${token}x` }, session)),
    ).toBe("Invalid CSRF token");
  });
});
