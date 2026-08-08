import { describe, expect, it } from "vitest";
import { tarExtractArgs } from "./safe-archive.js";

describe("tarExtractArgs", () => {
  it("includes -z for .tar.gz and always -x -f -C", async () => {
    const args = await tarExtractArgs("/tmp/demo.tar.gz", "/tmp/out");
    expect(args).toContain("-z");
    expect(args).toContain("-x");
    expect(args).toContain("-f");
    expect(args).toContain("/tmp/demo.tar.gz");
    expect(args).toContain("-C");
    expect(args).toContain("/tmp/out");
  });

  it("omits -z for plain .tar", async () => {
    const args = await tarExtractArgs("/tmp/demo.tar", "/tmp/out");
    expect(args).not.toContain("-z");
    expect(args.indexOf("-x")).toBeGreaterThanOrEqual(0);
  });
});
