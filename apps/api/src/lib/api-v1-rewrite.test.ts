import { describe, expect, it } from "vitest";
import { rewriteApiV1Url } from "./api-v1-rewrite.js";

describe("rewriteApiV1Url", () => {
  it("rewrites /api/v1 paths and query strings", () => {
    expect(rewriteApiV1Url("/api/v1")).toBe("/api");
    expect(rewriteApiV1Url("/api/v1/health")).toBe("/api/health");
    expect(rewriteApiV1Url("/api/v1/servers?x=1")).toBe("/api/servers?x=1");
    expect(rewriteApiV1Url("/api/v1?x=1")).toBe("/api?x=1");
  });

  it("leaves non-v1 URLs unchanged", () => {
    expect(rewriteApiV1Url("/api/health")).toBe("/api/health");
    expect(rewriteApiV1Url("/api/v10/x")).toBe("/api/v10/x");
    expect(rewriteApiV1Url("/apiv1/x")).toBe("/apiv1/x");
  });
});
