import { afterEach, describe, expect, it } from "vitest";
import {
  isSealedDatabasePassword,
  sealDatabasePassword,
  unsealDatabasePassword,
} from "./db-password.js";

const PREV = process.env.SESSION_SECRET;

afterEach(() => {
  if (PREV === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = PREV;
});

describe("db-password seal/unseal", () => {
  it("round-trips a password under SESSION_SECRET", () => {
    process.env.SESSION_SECRET = "unit-test-session-secret-db-pass";
    const sealed = sealDatabasePassword("s3cret-mysql!");
    expect(isSealedDatabasePassword(sealed)).toBe(true);
    expect(sealed).toMatch(/^enc:v1:/);
    expect(unsealDatabasePassword(sealed)).toBe("s3cret-mysql!");
  });

  it("is idempotent when already sealed", () => {
    process.env.SESSION_SECRET = "unit-test-session-secret-db-pass";
    const once = sealDatabasePassword("plain");
    const twice = sealDatabasePassword(once);
    expect(twice).toBe(once);
  });

  it("passes through legacy plaintext on read", () => {
    expect(unsealDatabasePassword("legacy-plain")).toBe("legacy-plain");
    expect(isSealedDatabasePassword("legacy-plain")).toBe(false);
  });

  it("fails closed on corrupt ciphertext", () => {
    process.env.SESSION_SECRET = "unit-test-session-secret-db-pass";
    expect(() => unsealDatabasePassword("enc:v1:not-valid-base64!!!")).toThrow();
  });

  it("does not decrypt under a different SESSION_SECRET", () => {
    process.env.SESSION_SECRET = "secret-a-aaaaaaaaaaaaaaaa";
    const sealed = sealDatabasePassword("mysql-pw");
    process.env.SESSION_SECRET = "secret-b-bbbbbbbbbbbbbbbb";
    expect(() => unsealDatabasePassword(sealed)).toThrow();
  });
});
