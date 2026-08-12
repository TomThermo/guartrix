import { describe, expect, it } from "vitest";

/** Mirrors nodes-placement.ts compareRank (RAM → CPU → storage). */
function compareRank(
  a: { mem: number; cpu: number; storageFree: number },
  b: { mem: number; cpu: number; storageFree: number },
): number {
  if (b.mem !== a.mem) return b.mem - a.mem;
  if (b.cpu !== a.cpu) return b.cpu - a.cpu;
  return b.storageFree - a.storageFree;
}

describe("create placement rank", () => {
  it("prefers most free RAM, then CPU, then storage", () => {
    const nodes = [
      { mem: 8192, cpu: 400, storageFree: 50_000 },
      { mem: 16_384, cpu: 200, storageFree: 10_000 },
      { mem: 16_384, cpu: 600, storageFree: 5_000 },
      { mem: 16_384, cpu: 600, storageFree: 80_000 },
    ];
    const sorted = [...nodes].sort(compareRank);
    expect(sorted[0]).toEqual({ mem: 16_384, cpu: 600, storageFree: 80_000 });
    expect(sorted[1]).toEqual({ mem: 16_384, cpu: 600, storageFree: 5_000 });
    expect(sorted[2]).toEqual({ mem: 16_384, cpu: 200, storageFree: 10_000 });
  });
});
