import { describe, expect, it } from "vitest";
import { changePasswordSchema, profilePatchSchema } from "./account-profile.js";

describe("profilePatchSchema", () => {
  it("accepts partial profile patches", () => {
    const parsed = profilePatchSchema.safeParse({
      displayName: "Ada",
      addressCountry: "nl",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.addressCountry).toBe("NL");
    }
  });

  it("rejects invalid country codes", () => {
    const parsed = profilePatchSchema.safeParse({ addressCountry: "NLD" });
    expect(parsed.success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const strong = "OldPassw0rd!x";
  const strongNew = "NewPassw0rd!y";

  it("requires matching confirm password", () => {
    const parsed = changePasswordSchema.safeParse({
      currentPassword: strong,
      newPassword: strongNew,
      confirmPassword: "Different1!z",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects reusing the current password", () => {
    const parsed = changePasswordSchema.safeParse({
      currentPassword: strong,
      newPassword: strong,
      confirmPassword: strong,
    });
    expect(parsed.success).toBe(false);
  });
});
