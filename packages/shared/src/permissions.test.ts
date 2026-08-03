import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS_WILDCARD,
  applyLicenseFeatureCeiling,
  hasPermission,
  isLicenseFeatureGroup,
  isServerPermission,
  normalizeLicenseFeatures,
  permissionsAllowedByLicenseFeatures,
  SERVER_PERMISSIONS,
} from "./permissions.js";

describe("isServerPermission", () => {
  it("accepts known keys and rejects unknowns", () => {
    expect(isServerPermission("control.start")).toBe(true);
    expect(isServerPermission("file.read")).toBe(true);
    expect(isServerPermission("not.a.permission")).toBe(false);
    expect(isServerPermission("*")).toBe(false);
  });

  it("covers every SERVER_PERMISSIONS entry", () => {
    for (const key of SERVER_PERMISSIONS) {
      expect(isServerPermission(key)).toBe(true);
    }
  });
});

describe("hasPermission", () => {
  it("returns false for missing grants", () => {
    expect(hasPermission(null, "control.start")).toBe(false);
    expect(hasPermission(undefined, "control.start")).toBe(false);
    expect(hasPermission([], "control.start")).toBe(false);
  });

  it("matches a single required permission", () => {
    expect(hasPermission(["control.start", "file.read"], "file.read")).toBe(
      true,
    );
    expect(hasPermission(["control.start"], "file.read")).toBe(false);
  });

  it("matches any of several required permissions", () => {
    expect(
      hasPermission(["control.stop"], ["control.start", "control.stop"]),
    ).toBe(true);
    expect(
      hasPermission(["file.read"], ["control.start", "control.stop"]),
    ).toBe(false);
  });

  it("treats * as full access", () => {
    expect(hasPermission([ALL_PERMISSIONS_WILDCARD], "backup.restore")).toBe(
      true,
    );
  });
});

describe("license feature helpers", () => {
  it("validates known group ids", () => {
    expect(isLicenseFeatureGroup("power")).toBe(true);
    expect(isLicenseFeatureGroup("nope")).toBe(false);
  });

  it("normalizes feature lists (null = unrestricted)", () => {
    expect(normalizeLicenseFeatures(null)).toBe(null);
    expect(normalizeLicenseFeatures(undefined)).toBe(null);
    expect(normalizeLicenseFeatures("power")).toBe(null);
    expect(normalizeLicenseFeatures(["power", "power", "nope"])).toEqual([
      "power",
    ]);
    expect(normalizeLicenseFeatures([])).toEqual([]);
  });

  it("expands features to permission keys", () => {
    expect(permissionsAllowedByLicenseFeatures(null)).toBe(null);
    const power = permissionsAllowedByLicenseFeatures(["power"]);
    expect(power).toContain("control.start");
    expect(power).not.toContain("file.read");
  });

  it("applies a license ceiling to granted permissions", () => {
    expect(
      applyLicenseFeatureCeiling(["control.start", "file.read"], null),
    ).toEqual(["control.start", "file.read"]);
    expect(
      applyLicenseFeatureCeiling(["control.start", "file.read"], ["power"]),
    ).toEqual(["control.start"]);
    const capped = applyLicenseFeatureCeiling(["*"], ["power"]);
    expect(capped).toContain("control.start");
    expect(capped).not.toContain("file.read");
  });
});
