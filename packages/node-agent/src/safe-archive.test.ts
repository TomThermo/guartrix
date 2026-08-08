import { describe, expect, it } from "vitest";
import { tarExtractArgs } from "./safe-archive.js";

describe("tarExtractArgs", () => {
  it("uses portable flags only (no GNU long options)", async () => {
    const args = await tarExtractArgs("/tmp/demo.tar.gz", "/tmp/out");
    expect(args).toEqual(["-z", "-x", "-f", "/tmp/demo.tar.gz", "-C", "/tmp/out"]);
    expect(args.some((a) => a.startsWith("--"))).toBe(false);
  });

  it("omits -z for plain .tar", async () => {
    const args = await tarExtractArgs("/tmp/demo.tar", "/tmp/out");
    expect(args).toEqual(["-x", "-f", "/tmp/demo.tar", "-C", "/tmp/out"]);
  });
});
