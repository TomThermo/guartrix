import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import { assertSameOrigin } from "./csrf.js";

function req(headers: Record<string, string | undefined>): FastifyRequest {
  return { headers } as FastifyRequest;
}

describe("assertSameOrigin", () => {
  it("allows missing Origin/Referer (SameSite cookie clients / curl)", () => {
    expect(assertSameOrigin(req({}))).toBeNull();
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

  it("rejects malformed Referer", () => {
    expect(assertSameOrigin(req({ referer: "not-a-url" }))).toBe(
      "Invalid referer",
    );
  });
});
