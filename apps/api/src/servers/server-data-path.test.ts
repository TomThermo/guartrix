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

import { prisma } from "../db.js";
import { mustDeployViaDaemon, resolveLocalServerDataDir } from "./server-data-path.js";

describe("server-data-path", () => {
  beforeEach(() => {
    vi.mocked(prisma.server.findUnique).mockReset();
  });

  it("uses panel DATA_DIR when no storage pool", async () => {
    vi.mocked(prisma.server.findUnique).mockResolvedValue({
      storageId: null,
      storage: null,
      node: { isLocal: true },
    } as never);
    await expect(resolveLocalServerDataDir("abc123")).resolves.toBe("/panel/data/servers/abc123");
    await expect(mustDeployViaDaemon("abc123", true)).resolves.toBe(false);
  });

  it("uses mountPoint for local storage pool", async () => {
    vi.mocked(prisma.server.findUnique).mockResolvedValue({
      storageId: "stor1",
      storage: { mountPoint: "/var/lib/guartrix/mounts/stor1" },
      node: { isLocal: true },
    } as never);
    await expect(resolveLocalServerDataDir("abc123")).resolves.toBe(
      "/var/lib/guartrix/mounts/stor1/servers/abc123",
    );
    await expect(mustDeployViaDaemon("abc123", true)).resolves.toBe(true);
  });

  it("always deploys via daemon for remote nodes", async () => {
    vi.mocked(prisma.server.findUnique).mockResolvedValue({
      storageId: null,
    } as never);
    await expect(mustDeployViaDaemon("abc123", false)).resolves.toBe(true);
  });
});
