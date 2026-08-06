import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isStrongPassword,
  passwordPolicyMessage,
  strongPasswordRefine,
} from "./password-policy.js";

describe("passwordPolicyMessage", () => {
  it("states length bounds and required character classes", () => {
    const msg = passwordPolicyMessage();
    expect(msg).toContain(String(PASSWORD_MIN_LENGTH));
    expect(msg).toContain(String(PASSWORD_MAX_LENGTH));
    expect(msg).toMatch(/uppercase/i);
    expect(msg).toMatch(/lowercase/i);
    expect(msg).toMatch(/number/i);
    expect(msg).toMatch(/symbol/i);
  });
});

describe("isStrongPassword / strongPasswordRefine", () => {
  const strong = "Aa1!xxxxxxxx"; // 12 chars, all classes

  it("accepts a strong password", () => {
    expect(isStrongPassword(strong)).toBe(true);
    expect(strongPasswordRefine(strong)).toBe(true);
  });

  it("rejects too short / too long", () => {
    expect(isStrongPassword("Aa1!xxxxxxx")).toBe(false); // 11
    expect(isStrongPassword(`Aa1!${"x".repeat(PASSWORD_MAX_LENGTH)}`)).toBe(
      false,
    );
  });

  it("requires each character class", () => {
    expect(isStrongPassword("aa1!xxxxxxxx")).toBe(false); // no upper
    expect(isStrongPassword("AA1!XXXXXXXX")).toBe(false); // no lower
    expect(isStrongPassword("Aa!!xxxxxxxx")).toBe(false); // no digit
    expect(isStrongPassword("Aa11xxxxxxxx")).toBe(false); // no symbol
  });
});
