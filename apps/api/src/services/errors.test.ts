import { describe, expect, it } from "vitest";
import { isServiceError, ServiceError } from "./errors.js";

describe("ServiceError", () => {
  it("maps to JSON body with optional code", () => {
    const err = new ServiceError(409, "Email taken", { code: "EMAIL_TAKEN" });
    expect(err.status).toBe(409);
    expect(err.toJSON()).toEqual({ error: "Email taken", code: "EMAIL_TAKEN" });
    expect(isServiceError(err)).toBe(true);
  });

  it("isServiceError rejects non-errors", () => {
    expect(isServiceError(new Error("x"))).toBe(false);
    expect(isServiceError("nope")).toBe(false);
  });
});
