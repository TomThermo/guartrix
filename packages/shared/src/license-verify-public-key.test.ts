import { describe, expect, it } from "vitest";
import {
  GUARTRIX_LICENSE_VERIFY_PUBLIC_KEY_PEM,
  normalizeLicenseVerifyPublicKeyPem,
  resolveLicenseVerifyPublicKeyPem,
} from "./license-verify-public-key.js";

describe("resolveLicenseVerifyPublicKeyPem", () => {
  it("prefers env over file and default", () => {
    const env =
      "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----";
    expect(
      resolveLicenseVerifyPublicKeyPem({
        envPem: env,
        filePem: "-----BEGIN PUBLIC KEY-----\nBBBB\n-----END PUBLIC KEY-----\n",
      }),
    ).toContain("AAAA");
  });

  it("uses file when env empty", () => {
    const file =
      "-----BEGIN PUBLIC KEY-----\nFILEKEY\n-----END PUBLIC KEY-----\n";
    expect(resolveLicenseVerifyPublicKeyPem({ envPem: "  ", filePem: file })).toBe(file);
  });

  it("falls back to baked-in Guartrix key", () => {
    expect(resolveLicenseVerifyPublicKeyPem({ envPem: null, filePem: null })).toBe(
      GUARTRIX_LICENSE_VERIFY_PUBLIC_KEY_PEM,
    );
  });

  it("wraps bare base64 body", () => {
    expect(normalizeLicenseVerifyPublicKeyPem("MCowBQYDK2VwAyEA")).toContain("BEGIN PUBLIC KEY");
  });
});
