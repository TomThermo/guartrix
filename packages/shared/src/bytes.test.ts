import { describe, expect, it } from "vitest";
import { formatBytes } from "./bytes.js";

describe("formatBytes", () => {
  it("returns 0 B for non-finite or negative", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
  });

  it("formats bytes under 1 KiB without a unit scale", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats KiB / MiB / GiB with expected precision", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
  });
});
