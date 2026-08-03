import { describe, expect, it } from "vitest";
import {
  parsePermissionsJson,
  serializePermissions,
} from "./server-access.js";

describe("parsePermissionsJson", () => {
  it("returns empty for invalid JSON or non-arrays", () => {
    expect(parsePermissionsJson("")).toEqual([]);
    expect(parsePermissionsJson("{")).toEqual([]);
    expect(parsePermissionsJson('"control.start"')).toEqual([]);
    expect(parsePermissionsJson("null")).toEqual([]);
    expect(parsePermissionsJson("{}")).toEqual([]);
  });

  it("keeps known server permissions and drops junk", () => {
    expect(
      parsePermissionsJson(
        JSON.stringify(["control.start", "file.read", "not-a-perm", 42, null]),
      ),
    ).toEqual(["control.start", "file.read"]);
  });
});

describe("serializePermissions", () => {
  it("dedupes and filters invalid entries", () => {
    const raw = serializePermissions([
      "control.start",
      "control.start",
      "file.read",
      "nope",
    ]);
    expect(JSON.parse(raw).sort()).toEqual(["control.start", "file.read"].sort());
  });

  it("round-trips with parsePermissionsJson", () => {
    const perms = ["control.stop", "control.console", "file.update"];
    expect(parsePermissionsJson(serializePermissions(perms)).sort()).toEqual(
      [...perms].sort(),
    );
  });
});
