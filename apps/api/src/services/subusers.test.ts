import { describe, expect, it } from "vitest";
import { serializeSubUser } from "./subusers.js";

describe("serializeSubUser", () => {
  it("marks invite pending when token not expired", () => {
    const row = serializeSubUser({
      id: "su1",
      serverId: "s1",
      email: "friend@example.com",
      userId: null,
      permissions: "[]",
      inviteTokenHash: "abc",
      inviteExpiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      user: null,
    });
    expect(row.invitePending).toBe(true);
    expect(row.username).toBeNull();
    expect(row.permissions).toEqual([]);
  });

  it("clears pending when invite expired", () => {
    const row = serializeSubUser({
      id: "su1",
      serverId: "s1",
      email: "friend@example.com",
      userId: "u2",
      permissions: '["control.console"]',
      inviteTokenHash: "abc",
      inviteExpiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      user: { username: "friend" },
    });
    expect(row.invitePending).toBe(false);
    expect(row.username).toBe("friend");
    expect(row.permissions).toContain("control.console");
  });
});
