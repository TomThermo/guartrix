import { describe, expect, it } from "vitest";
import { isUnsafeMemberPath, tarExtractArgs } from "./safe-archive.js";

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

describe("isUnsafeMemberPath", () => {
  it("allows normal files and directory members with trailing slash", () => {
    expect(isUnsafeMemberPath("config/")).toBe(false);
    expect(isUnsafeMemberPath("./config/")).toBe(false);
    expect(isUnsafeMemberPath("./config/paper-global.yml")).toBe(false);
    expect(isUnsafeMemberPath("plugins/Foo/config.yml")).toBe(false);
    expect(isUnsafeMemberPath("world/")).toBe(false);
  });

  it("rejects traversal and absolute paths", () => {
    expect(isUnsafeMemberPath("../etc/passwd")).toBe(true);
    expect(isUnsafeMemberPath("foo/../../bar")).toBe(true);
    expect(isUnsafeMemberPath("/etc/passwd")).toBe(true);
    expect(isUnsafeMemberPath("C:/Windows/system.ini")).toBe(true);
    expect(isUnsafeMemberPath("foo//bar")).toBe(true);
  });
});
