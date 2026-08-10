import { beforeEach, describe, expect, it, vi } from "vitest";

const { startServerTransfer, getTransferJob } = vi.hoisted(() => ({
  startServerTransfer: vi.fn(),
  getTransferJob: vi.fn(),
}));

const { findServerOrThrow } = vi.hoisted(() => ({
  findServerOrThrow: vi.fn(),
}));

vi.mock("../servers/transfer.js", () => ({
  startServerTransfer,
  getTransferJob,
}));

vi.mock("./servers.js", () => ({ findServerOrThrow }));
vi.mock("../servers/serialize.js", () => ({
  toMcServer: (s: Record<string, unknown>) => ({ id: s.id, name: s.name }),
  serverListInclude: {},
}));
vi.mock("../servers/transfer/start.js", () => ({
  startServerTransfer,
  executeQueuedTransfer: vi.fn(),
}));

import { getServerTransferView, initiateServerTransfer } from "./servers-transfer.js";

const serverRow = {
  id: "srv_1",
  name: "Lobby",
  type: "PAPER",
  status: "TRANSFERRING",
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
  node: { name: "Node A" },
};

beforeEach(() => {
  vi.clearAllMocks();
  findServerOrThrow.mockResolvedValue(serverRow);
  getTransferJob.mockReturnValue(null);
});

describe("servers-transfer service", () => {
  it("initiateServerTransfer returns server + job", async () => {
    const job = { serverId: "srv_1", phase: "staging" };
    startServerTransfer.mockResolvedValue(job);
    getTransferJob.mockReturnValue(job);

    const result = await initiateServerTransfer({
      serverId: "srv_1",
      toNodeId: "node_b",
      actor: { id: "u1", username: "admin", role: "ADMIN" } as never,
    });

    expect(result.server.id).toBe("srv_1");
    expect(result.transfer).toEqual(job);
    expect(startServerTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: "srv_1", toNodeId: "node_b" }),
    );
  });

  it("getServerTransferView includes null transfer when idle", async () => {
    getTransferJob.mockReturnValue(null);
    const result = await getServerTransferView("srv_1");
    expect(result.transfer).toBeNull();
    expect(result.server.id).toBe("srv_1");
  });
});
