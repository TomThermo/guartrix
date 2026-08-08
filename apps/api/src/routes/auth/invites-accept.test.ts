import { describe, expect, it } from "vitest";
import { canAcceptInvite } from "./invites-policy.js";

describe("canAcceptInvite", () => {
  it("rejects mismatched email", () => {
    expect(
      canAcceptInvite({
        sessionEmail: "a@example.com",
        emailVerified: true,
        inviteEmail: "b@example.com",
      }),
    ).toEqual({ ok: false, reason: "email_mismatch" });
  });

  it("rejects unverified email even when address matches", () => {
    expect(
      canAcceptInvite({
        sessionEmail: "a@example.com",
        emailVerified: false,
        inviteEmail: "a@example.com",
      }),
    ).toEqual({ ok: false, reason: "email_unverified" });
  });

  it("allows verified matching email", () => {
    expect(
      canAcceptInvite({
        sessionEmail: "A@Example.com",
        emailVerified: true,
        inviteEmail: "a@example.com",
      }),
    ).toEqual({ ok: true });
  });
});
