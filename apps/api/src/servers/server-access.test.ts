import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subUserFindFirst: vi.fn(),
  subUserFindMany: vi.fn(),
  subUserUpdate: vi.fn(),
  subUserUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
  serverFindUnique: vi.fn(),
  serverFindMany: vi.fn(),
  getCachedLicenseState: vi.fn(),
  validateLicense: vi.fn(),
}));

vi.mock("../db.js", () => ({
  prisma: {
    subUser: {
      findFirst: mocks.subUserFindFirst,
      findMany: mocks.subUserFindMany,
      update: mocks.subUserUpdate,
      updateMany: mocks.subUserUpdateMany,
    },
    user: { findUnique: mocks.userFindUnique },
    server: {
      findUnique: mocks.serverFindUnique,
      findMany: mocks.serverFindMany,
    },
  },
}));

vi.mock("../license/license.js", () => ({
  getCachedLicenseState: mocks.getCachedLicenseState,
  validateLicense: mocks.validateLicense,
}));

vi.mock("./serialize.js", () => ({ serverListInclude: {} }));

import {
  findSubUserForAccess,
  getServerPermissions,
  getServerPermissionsBatch,
  hasServerPermission,
  hashInviteToken,
  isServerOwner,
  isValidEmail,
  linkPendingSubUsers,
  listVisibleServerIds,
  listVisibleServers,
  normalizeInviteEmail,
  parsePermissionsJson,
  permissionDeniedMessage,
  resolveServerAccess,
  serializePermissions,
  userCanAccessServer,
  userHasServerPermission,
  usernameFromEmail,
} from "./server-access.js";

const admin = { id: "admin-1", role: "ADMIN" } as const;
const owner = { id: "user-1", role: "USER" } as const;
const guest = { id: "user-2", role: "USER" } as const;
const server = { id: "srv-1", ownerId: owner.id };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCachedLicenseState.mockReturnValue(null);
  mocks.validateLicense.mockResolvedValue(null);
  mocks.subUserFindFirst.mockResolvedValue(null);
  mocks.subUserFindMany.mockResolvedValue([]);
  mocks.subUserUpdate.mockResolvedValue({});
  mocks.subUserUpdateMany.mockResolvedValue({ count: 0 });
  mocks.userFindUnique.mockResolvedValue(null);
  mocks.serverFindUnique.mockResolvedValue(null);
  mocks.serverFindMany.mockResolvedValue([]);
});

describe("parsePermissionsJson", () => {
  it("returns empty for invalid JSON or non-arrays", () => {
    expect(parsePermissionsJson("")).toEqual([]);
    expect(parsePermissionsJson("{")).toEqual([]);
    expect(parsePermissionsJson('"control.start"')).toEqual([]);
    expect(parsePermissionsJson("null")).toEqual([]);
    expect(parsePermissionsJson("{}")).toEqual([]);
  });

  it("keeps known server permissions and drops junk", () => {
    expect(
      parsePermissionsJson(
        JSON.stringify(["control.start", "file.read", "not-a-perm", 42, null]),
      ),
    ).toEqual(["control.start", "file.read"]);
  });
});

describe("serializePermissions", () => {
  it("dedupes and filters invalid entries", () => {
    const raw = serializePermissions([
      "control.start",
      "control.start",
      "file.read",
      "nope",
    ]);
    expect(JSON.parse(raw).sort()).toEqual(["control.start", "file.read"].sort());
  });

  it("round-trips with parsePermissionsJson", () => {
    const perms = ["control.stop", "control.console", "file.update"];
    expect(parsePermissionsJson(serializePermissions(perms)).sort()).toEqual(
      [...perms].sort(),
    );
  });
});

describe("subuser access", () => {
  it("returns an existing user-linked subuser", async () => {
    mocks.subUserFindFirst.mockResolvedValueOnce({
      id: "sub-1",
      userId: guest.id,
      permissions: '["file.read"]',
    });
    await expect(findSubUserForAccess(server.id, guest)).resolves.toMatchObject({
      id: "sub-1",
      permissionsList: ["file.read"],
    });
  });

  it("requires a verified email before matching an invite", async () => {
    mocks.userFindUnique.mockResolvedValue({
      email: "guest@example.com",
      emailVerified: false,
    });
    await expect(findSubUserForAccess(server.id, guest)).resolves.toBeNull();
    expect(mocks.subUserFindFirst).toHaveBeenCalledTimes(1);
  });

  it("links and returns a pending email invite", async () => {
    mocks.userFindUnique.mockResolvedValue({
      email: " Guest@Example.com ",
      emailVerified: true,
    });
    mocks.subUserFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "sub-2",
        userId: null,
        permissions: '["control.start"]',
      });

    await expect(findSubUserForAccess(server.id, guest)).resolves.toMatchObject({
      userId: guest.id,
      permissionsList: ["control.start"],
    });
    expect(mocks.subUserUpdate).toHaveBeenCalledWith({
      where: { id: "sub-2" },
      data: { userId: guest.id },
    });
  });
});

describe("permission resolution", () => {
  it("grants full access to admins and owners", async () => {
    await expect(getServerPermissions(admin, server)).resolves.toEqual(["*"]);
    await expect(getServerPermissions(owner, server)).resolves.toEqual(["*"]);
  });

  it("uses subuser permissions and applies the license ceiling", async () => {
    mocks.subUserFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: guest.id,
      permissions: '["file.read","control.start"]',
    });
    mocks.getCachedLicenseState.mockReturnValue({
      valid: true,
      features: ["file"],
    });
    await expect(getServerPermissions(guest, server)).resolves.toEqual([
      "file.read",
    ]);
  });

  it("keeps permissions when license validation fails", async () => {
    mocks.validateLicense.mockRejectedValue(new Error("offline"));
    await expect(getServerPermissions(admin, server)).resolves.toEqual(["*"]);
  });

  it("explains ordinary and license-based denials", () => {
    expect(permissionDeniedMessage(guest, server, [])).toBe("Missing permission");

    mocks.getCachedLicenseState.mockReturnValue({ valid: true, features: [] });
    expect(permissionDeniedMessage(owner, server, [])).toMatch(/no feature groups/i);

    mocks.getCachedLicenseState.mockReturnValue({
      valid: true,
      features: ["file"],
    });
    expect(permissionDeniedMessage(owner, server, ["file.read"])).toMatch(
      /current license feature groups/i,
    );

    mocks.getCachedLicenseState.mockImplementation(() => {
      throw new Error("bad cache");
    });
    expect(permissionDeniedMessage(owner, server, [])).toBe("Missing permission");
  });

  it("checks access, ownership, and required permissions", async () => {
    expect(isServerOwner(admin, server)).toBe(true);
    expect(isServerOwner(owner, server)).toBe(true);
    expect(isServerOwner(guest, server)).toBe(false);
    await expect(userCanAccessServer(admin, server)).resolves.toBe(true);
    await expect(userCanAccessServer(owner, server)).resolves.toBe(true);
    await expect(userCanAccessServer(guest, server)).resolves.toBe(false);

    mocks.subUserFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: guest.id,
      permissions: '["file.read"]',
    });
    await expect(userCanAccessServer(guest, server)).resolves.toBe(true);
    await expect(
      userHasServerPermission(guest, server, "file.read"),
    ).resolves.toBe(true);
    expect(hasServerPermission({ permissions: ["file.read"] }, "file.read")).toBe(
      true,
    );
  });
});

describe("batch permissions", () => {
  const servers = [
    server,
    { id: "srv-2", ownerId: "someone-else" },
  ];

  it("handles empty, admin, and owner-only batches", async () => {
    await expect(getServerPermissionsBatch(owner, [])).resolves.toEqual(new Map());

    const adminResult = await getServerPermissionsBatch(admin, servers);
    expect(adminResult.get("srv-1")).toEqual(["*"]);
    expect(adminResult.get("srv-2")).toEqual(["*"]);

    const ownerResult = await getServerPermissionsBatch(owner, [server]);
    expect(ownerResult.get(server.id)).toEqual(["*"]);
  });

  it("collects subuser rows, prefers linked rows, and links invites", async () => {
    mocks.userFindUnique.mockResolvedValue({
      email: "USER-2@EXAMPLE.COM",
      emailVerified: true,
    });
    mocks.subUserFindMany.mockResolvedValue([
      {
        id: "invite",
        serverId: "srv-2",
        userId: null,
        permissions: '["control.start"]',
      },
      {
        id: "linked",
        serverId: "srv-2",
        userId: guest.id,
        permissions: '["file.read"]',
      },
    ]);

    const result = await getServerPermissionsBatch(guest, servers);
    expect(result.get("srv-1")).toEqual([]);
    expect(result.get("srv-2")).toEqual(["file.read"]);
    expect(mocks.subUserUpdateMany).not.toHaveBeenCalled();

    mocks.subUserFindMany.mockResolvedValue([
      {
        id: "invite",
        serverId: "srv-2",
        userId: null,
        permissions: '["control.start"]',
      },
    ]);
    await getServerPermissionsBatch(guest, servers);
    expect(mocks.subUserUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["invite"] } },
      data: { userId: guest.id },
    });
  });
});

describe("access helpers and visible server lists", () => {
  it("normalizes account invitation values", () => {
    expect(normalizeInviteEmail(" Person@Example.COM ")).toBe(
      "person@example.com",
    );
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(usernameFromEmail("ab@example.com")).toBe("abuser");
    expect(usernameFromEmail("a.b+long@example.com")).toBe("a_b_long");
    expect(usernameFromEmail("@example.com")).toBe("user");
    expect(hashInviteToken("token")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("links pending subusers only when an email is present", async () => {
    await linkPendingSubUsers(guest.id, null);
    expect(mocks.subUserUpdateMany).not.toHaveBeenCalled();
    await linkPendingSubUsers(guest.id, " Guest@Example.com ");
    expect(mocks.subUserUpdateMany).toHaveBeenCalledWith({
      where: { email: "guest@example.com", userId: null },
      data: { userId: guest.id },
    });
  });

  it("resolves an accessible server and rejects missing/inaccessible servers", async () => {
    await expect(resolveServerAccess(owner, server.id)).resolves.toBeNull();

    mocks.serverFindUnique.mockResolvedValue(server);
    await expect(resolveServerAccess(guest, server.id)).resolves.toBeNull();
    await expect(resolveServerAccess(owner, server.id)).resolves.toMatchObject({
      server,
      permissions: ["*"],
      isOwner: true,
    });
  });

  it("lists visible servers and applies API-key scope", async () => {
    mocks.serverFindMany.mockResolvedValue([
      { id: "srv-1" },
      { id: "srv-2" },
    ]);
    await expect(listVisibleServers(admin)).resolves.toHaveLength(2);
    await expect(
      listVisibleServers(guest, { apiKeyAuth: { serverIds: ["srv-2"] } }),
    ).resolves.toEqual([{ id: "srv-2" }]);
    expect(mocks.serverFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.any(Object) }),
    );
  });

  it("lists visible server ids and applies API-key scope", async () => {
    mocks.serverFindMany.mockResolvedValue([{ id: "srv-1" }, { id: "srv-2" }]);
    await expect(listVisibleServerIds(admin)).resolves.toEqual([
      "srv-1",
      "srv-2",
    ]);
    await expect(
      listVisibleServerIds(guest, {
        apiKeyAuth: { serverIds: ["srv-1"] },
      }),
    ).resolves.toEqual(["srv-1"]);
  });
});
