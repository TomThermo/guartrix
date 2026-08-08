import { describe, expect, it } from "vitest";
import { parseExtraMounts } from "./extra-mounts.js";

describe("parseExtraMounts", () => {
  it("accepts allowlisted host paths", () => {
    const mounts = parseExtraMounts([
      {
        host: "/var/lib/guartrix/shared/plugins",
        container: "/plugins-shared",
        readOnly: true,
      },
    ]);
    expect(mounts).toEqual([
      {
        host: "/var/lib/guartrix/shared/plugins",
        container: "/plugins-shared",
        readOnly: true,
      },
    ]);
  });

  it("rejects /data container paths and path escape", () => {
    expect(() =>
      parseExtraMounts([{ host: "/var/lib/guartrix/shared/x", container: "/data" }]),
    ).toThrow(/\/data/i);
    expect(() =>
      parseExtraMounts([
        {
          host: "/var/lib/guartrix/shared/../etc",
          container: "/shared",
        },
      ]),
    ).toThrow(/\.\./);
  });

  it("rejects hosts outside EXTRA_MOUNTS_ALLOW_PREFIX", () => {
    expect(() => parseExtraMounts([{ host: "/etc/passwd", container: "/evil" }])).toThrow(
      /allowed prefix/i,
    );
  });

  it("clears with null / empty array", () => {
    expect(parseExtraMounts(null)).toBeNull();
    expect(parseExtraMounts([])).toBeNull();
  });
});
