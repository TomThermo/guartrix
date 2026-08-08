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
    expect(mcseedmapVersion("not-a-version")).toBe("1.21.4-Java");
  });

  it("maps Chunkbase platforms across major lines", () => {
    expect(seedMapPlatform("1.21.4")).toBe("java_1_21_4");
    expect(seedMapPlatform("1.21.9")).toBe("java_1_21_9");
    expect(seedMapPlatform("1.21.6")).toBe("java_1_21_6");
    expect(seedMapPlatform("1.21.5")).toBe("java_1_21_5");
    expect(seedMapPlatform("1.21.2")).toBe("java_1_21_2");
    expect(seedMapPlatform("1.21")).toBe("java_1_21");
    expect(seedMapPlatform("1.20.4")).toBe("java_1_20");
    expect(seedMapPlatform("1.19.3")).toBe("java_1_19_3");
    expect(seedMapPlatform("1.19.2")).toBe("java_1_19");
    expect(seedMapPlatform("1.18.2")).toBe("java_1_18");
    expect(seedMapPlatform("1.7.10")).toBe("java_1_7");
    expect(seedMapPlatform("26.3.0")).toBe("java_26_3");
    expect(seedMapPlatform("26.2.0")).toBe("java_26_2");
    expect(seedMapPlatform("26.1.0")).toBe("java_26_1");
    expect(seedMapPlatform("25.0.0")).toBe("java_26_1");
    expect(seedMapPlatform("bogus")).toBe("java_1_21");
    expect(seedMapPlatform("1.6.4")).toBe("java_1_21");
  });

  it("builds framed and external URLs", () => {
    expect(buildSeedMapUrl("123", "1.21.4")).toContain("mcseedmap.net");
    expect(buildSeedMapUrl("a b", "1.21.4")).toContain(encodeURIComponent("a b"));
    expect(buildExternalSeedMapUrl("123", "1.21.4")).toContain("chunkbase.com");
    expect(buildExternalSeedMapUrl("123", "1.21.4")).toContain("platform=java_1_21_4");
  });
});
