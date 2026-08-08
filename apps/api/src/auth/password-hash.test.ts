import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "./password-hash.js";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a password with a random salt (versioned format)", () => {
    const stored = hashPassword("correct-horse-battery");
    expect(stored).toMatch(/^scrypt\$v1\$16384\$8\$1\$[0-9a-f]+\$[0-9a-f]+$/i);
    expect(verifyPassword("correct-horse-battery", stored)).toBe(true);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
    expect(needsRehash(stored)).toBe(false);
  });

  it("reuses an explicit salt", () => {
    const salt = "a".repeat(32);
    const a = hashPassword("same-password", salt);
    const b = hashPassword("same-password", salt);
    expect(a).toBe(b);
    expect(verifyPassword("same-password", a)).toBe(true);
  });

  it("accepts legacy salt:hash and flags rehash", () => {
    const salt = "b".repeat(32);
    const hash = scryptSync("legacy-pass", salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }).toString("hex");
    const legacy = `${salt}:${hash}`;
    expect(needsRehash(legacy)).toBe(true);
    expect(verifyPassword("legacy-pass", legacy)).toBe(true);
    expect(verifyPassword("wrong", legacy)).toBe(false);
  });

  it("rejects malformed stored hashes", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "nosalt")).toBe(false);
    expect(verifyPassword("x", "salt:zz")).toBe(false);
    expect(verifyPassword("x", "scrypt$v1$16384$8$1$onlysalt")).toBe(false);
    expect(verifyPassword("x", "scrypt$v1$NaN$8$1$aa$bb")).toBe(false);
    expect(verifyPassword("x", "scrypt$v1$1$8$1$aa$bb")).toBe(false);
    expect(verifyPassword("x", "scrypt$v1$16384$0$1$aa$bb")).toBe(false);
    // Odd-length hex hash → Buffer length mismatch vs scrypt output
    const salt = "c".repeat(32);
    const oddHash = "ab";
    expect(verifyPassword("x", `scrypt$v1$16384$8$1$${salt}$${oddHash}`)).toBe(false);
    expect(verifyPassword("x", `${salt}:zz`)).toBe(false);
  });
});
