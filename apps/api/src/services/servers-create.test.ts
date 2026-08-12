import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@guartrix/shared";

const { assertCanCreateServer } = vi.hoisted(() => ({
  assertCanCreateServer: vi.fn(),
}));

const { resolveCreatePlacement, assertNodeCapacity } = vi.hoisted(() => ({
  resolveCreatePlacement: vi.fn(),
  assertNodeCapacity: vi.fn(),
}));

const { isGamePortAvailable } = vi.hoisted(() => ({
  isGamePortAvailable: vi.fn(),
}));

const { beginPanelServerCreate, finishPanelCreateInBackground } = vi.hoisted(() => ({
  beginPanelServerCreate: vi.fn(),
  finishPanelCreateInBackground: vi.fn(),
}));

const { logActivity } = vi.hoisted(() => ({
  logActivity: vi.fn(),
}));

vi.mock("../billing/quotas.js", () => ({ assertCanCreateServer }));
vi.mock("../nodes/nodes.js", () => ({ resolveCreatePlacement, assertNodeCapacity }));
vi.mock("../servers/game-port.js", () => ({ isGamePortAvailable }));
vi.mock("../servers/server-provision.js", () => ({
  beginPanelServerCreate,
  finishPanelCreateInBackground,
}));
vi.mock("../activity-log.js", () => ({ logActivity }));
vi.mock("../servers/serialize.js", () => ({
  toMcServer: (s: unknown) => s,
  serverListInclude: {},
}));

import { createPanelServer } from "./servers-create.js";

const operator: AuthUser = {
  id: "u1",
  username: "alice",
  role: "OPERATOR",
  email: "alice@example.com",
  emailVerified: true,
  twoFactorEnabled: false,
  twoFactorRequired: false,
  maxServers: 1,
  maxMemoryMb: 4096,
  maxDatabases: 3,
  serverCount: 0,
  memoryUsedMb: 0,
  databaseCount: 0,
};

const baseInput = {
  name: "Test",
  type: "PAPER" as const,
  mcVersion: "1.21.1",
  port: 25565,
  memoryMb: 2048,
};

const request = {} as import("fastify").FastifyRequest;

beforeEach(() => {
  vi.clearAllMocks();
  assertCanCreateServer.mockResolvedValue(undefined);
  resolveCreatePlacement.mockResolvedValue({ nodeId: "node_a", storageId: null });
  assertNodeCapacity.mockResolvedValue(undefined);
  isGamePortAvailable.mockResolvedValue(true);
});

describe("createPanelServer", () => {
  it("rejects non-admin node selection", async () => {
    const result = await createPanelServer(
      operator,
      { ...baseInput, nodeId: "node_b" },
      request,
    );
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Only admins can choose a node",
    });
    expect(resolveCreatePlacement).not.toHaveBeenCalled();
  });

  it("rejects invalid extraMounts", async () => {
    const result = await createPanelServer(
      operator,
      {
        ...baseInput,
        extraMounts: [{ host: "not-absolute", container: "/data/foo" }],
      },
      request,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(String(result.error)).toMatch(/absolute path/i);
    }
  });

  it("maps quota errors to 403", async () => {
    assertCanCreateServer.mockRejectedValue(new Error("Server limit reached"));
    const result = await createPanelServer(operator, baseInput, request);
    expect(result).toEqual({ ok: false, status: 403, error: "Server limit reached" });
  });

  it("returns 409 when game port is taken", async () => {
    isGamePortAvailable.mockResolvedValue(false);
    const result = await createPanelServer(operator, baseInput, request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(String(result.error)).toMatch(/25565/);
    }
  });

  it("starts background provisioning on success", async () => {
    beginPanelServerCreate.mockResolvedValue({
      id: "srv_1",
      server: {
        id: "srv_1",
        name: "Test",
        type: "PAPER",
        status: "CREATING",
        port: 25565,
        memoryMb: 2048,
        diskMb: 10240,
        cpuLimit: 0,
        ownerId: "u1",
        nodeId: "node_a",
        mcVersion: "1.21.1",
        suspended: false,
        subdomain: null,
        owner: { username: "alice" },
        node: { name: "Local" },
      },
    });

    const result = await createPanelServer(operator, baseInput, request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(201);
      expect(result.body.id).toBe("srv_1");
    }
    expect(finishPanelCreateInBackground).toHaveBeenCalledOnce();
    expect(finishPanelCreateInBackground.mock.calls[0]?.[0]?.input?.id).toBe("srv_1");
  });
});
