import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertNotSensitive,
  isSensitiveFileName,
} from "./files-crud.js";

describe("sensitive control files", () => {
  it("recognizes protected Guartrix and legacy BlockHost file names", () => {
    expect(isSensitiveFileName("guartrix-addons.json")).toBe(true);
    expect(isSensitiveFileName("nested/GUARTRIX-custom.json")).toBe(true);
    expect(isSensitiveFileName("world/blockhost-console-history.json")).toBe(true);
    expect(isSensitiveFileName("server.properties")).toBe(false);
    expect(isSensitiveFileName("world/ops.json")).toBe(false);
  });

  it("rejects protected control files and permits ordinary server files", () => {
    expect(() => assertNotSensitive("config/guartrix-limits.json")).toThrow(
      /control file cannot be edited/i,
    );
    expect(() => assertNotSensitive("BLOCKHOST-private.json")).toThrow(
      /control file cannot be edited/i,
    );
    expect(() => assertNotSensitive("server.properties")).not.toThrow();
  });
});

describe("resolveSafePath", () => {
  let dataDir: string;
  let resolveSafePath: typeof import("./files-crud.js").resolveSafePath;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "guartrix-jail-"));
    process.env.DATA_DIR = dataDir;
    vi.resetModules();
    ({ resolveSafePath } = await import("./files-crud.js"));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("resolves paths inside the server jail", () => {
    const r = resolveSafePath("srv1", "world/region");
    expect(r.relative).toBe("world/region");
    expect(r.absolute.startsWith(r.root)).toBe(true);
    expect(r.root).toContain(path.join("servers", "srv1"));
  });

  it("rejects .. traversal", () => {
    expect(() => resolveSafePath("srv1", "../etc/passwd")).toThrow(/Invalid path/i);
    expect(() => resolveSafePath("srv1", "world/../../etc")).toThrow(/Invalid path/i);
  });

  it("rejects symlink components that escape the jail", () => {
    const root = path.join(dataDir, "servers", "srv1");
    fs.mkdirSync(root, { recursive: true });
    const outside = path.join(dataDir, "outside");
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, "secret.txt"), "nope");
    fs.symlinkSync(outside, path.join(root, "escape"));
    expect(() => resolveSafePath("srv1", "escape/secret.txt")).toThrow(
      /symlink/i,
    );
  });
});
