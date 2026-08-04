import { describe, expect, it } from "vitest";
import {
  buildExternalSeedMapUrl,
  buildSeedMapUrl,
  mcseedmapVersion,
  seedMapPlatform,
} from "./world-seed-urls.js";

describe("world-seed-urls", () => {
  it("maps mcseedmap version segments", () => {
    expect(mcseedmapVersion("1.21.4")).toBe("1.21.4-Java");
    expect(mcseedmapVersion("26.2")).toBe("26.2.0-Java");
  });

  it("maps Chunkbase platforms", () => {
    expect(seedMapPlatform("1.21.4")).toBe("java_1_21_4");
    expect(seedMapPlatform("1.21.9")).toBe("java_1_21_9");
    expect(seedMapPlatform("26.2.0")).toBe("java_26_2");
  });

  it("builds framed and external URLs", () => {
    expect(buildSeedMapUrl("123", "1.21.4")).toContain("mcseedmap.net");
    expect(buildExternalSeedMapUrl("123", "1.21.4")).toContain("chunkbase.com");
  });
});
