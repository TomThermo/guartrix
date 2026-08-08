import { describe, expect, it } from "vitest";
import { isArchiveName, joinPath, parentPath } from "./paths";

describe("parentPath", () => {
  it("returns root for empty / single segment", () => {
    expect(parentPath("")).toBe(".");
    expect(parentPath("world")).toBe(".");
    expect(parentPath("world/region")).toBe("world");
  });
});

describe("joinPath", () => {
  it("joins under cwd and root", () => {
    expect(joinPath(".", "plugins")).toBe("plugins");
    expect(joinPath("", "plugins")).toBe("plugins");
    expect(joinPath("plugins", "LuckPerms")).toBe("plugins/LuckPerms");
  });

  it("does not evaluate .. as client-side jail (server enforces)", () => {
    // UI join is cosmetic; real jail is resolveSafePath on the agent.
    expect(joinPath("world", "..")).toBe("world/..");
  });
});

describe("isArchiveName", () => {
  it("detects common archive extensions", () => {
    expect(isArchiveName("backup.zip")).toBe(true);
    expect(isArchiveName("world.tar.gz")).toBe(true);
    expect(isArchiveName("x.tgz")).toBe(true);
    expect(isArchiveName("x.tar")).toBe(true);
    expect(isArchiveName("server.properties")).toBe(false);
  });
});
