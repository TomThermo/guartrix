import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db.js", () => ({
  prisma: {
    server: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../config.js", () => ({
  serverDir: (id: string) => `/panel/data/servers/${id}`,
}));

vi.mock("../services/storage-pools.js", () => ({
  resolveStorageMountPoint: vi.fn(),
}));

import { prisma } from "../db.js";
import { resolveStorageMountPoint } from "../services/storage-pools.js";
import { mustDeployViaDaemon, resolveLocalServerDataDir } from "./server-data-path.js";

describe("server-data-path", () => {
  beforeEach(() => {
    vi.mocked(prisma.server.findUnique).mockReset();
    vi.mocked(resolveStorageMountPoint).mockReset();
  });

  it("uses panel DATA_DIR when no storage pool", async () => {
    vi.mocked(prisma.server.findUnique).mockResolvedValue({
      storageId: null,
      nodeId: "node1",
      node: { isLocal: true },
    } as never);
    await expect(resolveLocalServerDataDir("abc123")).resolves.toBe("/panel/data/servers/abc123");
    expect(mustDeployViaDaemon(true)).toBe(false);
  });

  it("uses mountPoint for local storage pool (no tar deploy)", async () => {
    vi.mocked(prisma.server.findUnique).mockResolvedValue({
      storageId: "stor1",
      nodeId: "node1",
      node: { isLocal: true },
    } as never);
    vi.mocked(resolveStorageMountPoint).mockResolvedValue("/var/lib/guartrix/mounts/stor1");
    await expect(resolveLocalServerDataDir("abc123")).resolves.toBe(
      "/var/lib/guartrix/mounts/stor1/servers/abc123",
    );
    expect(mustDeployViaDaemon(true)).toBe(false);
  });

  it("always deploys via daemon for remote nodes", () => {
    expect(mustDeployViaDaemon(false)).toBe(true);
  });
});
