import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password-hash.js";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password with a random salt", () => {
    const stored = hashPassword("correct-horse-battery");
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/i);
    expect(verifyPassword("correct-horse-battery", stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("reuses an explicit salt", () => {
    const salt = "a".repeat(32);
    const a = hashPassword("same-password", salt);
    const b = hashPassword("same-password", salt);
    expect(a).toBe(b);
    expect(verifyPassword("same-password", a)).toBe(true);
  });

  it("rejects malformed stored hashes", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "nosalt")).toBe(false);
    expect(verifyPassword("x", "salt:zz")).toBe(false);
  });
});
