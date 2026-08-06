import { describe, expect, it } from "vitest";
import {
  looksLikeJwt,
  signDaemonJwt,
  verifyDaemonJwt,
} from "./daemon-jwt.js";

const SECRET = "unit-test-daemon-secret-value";

describe("daemon JWT", () => {
  it("signs and verifies a round-trip token", () => {
    const now = 1_700_000_000;
    const token = signDaemonJwt(SECRET, {
      nodeId: "node_abc",
      aud: "daemon",
      ttlSec: 300,
      nowSec: now,
    });
    expect(looksLikeJwt(token)).toBe(true);
    const claims = verifyDaemonJwt(token, SECRET, {
      aud: "daemon",
      nodeId: "node_abc",
      nowSec: now + 10,
    });
    expect(claims).toMatchObject({
      iss: "guartrix",
      aud: "daemon",
      nid: "node_abc",
      iat: now,
      exp: now + 300,
    });
  });

  it("rejects wrong secret, audience, node, or expiry", () => {
    const now = 1_700_000_000;
    const token = signDaemonJwt(SECRET, {
      nodeId: "node_abc",
      aud: "daemon",
      ttlSec: 60,
      nowSec: now,
    });
    expect(
      verifyDaemonJwt(token, "other-secret", {
        aud: "daemon",
        nowSec: now,
      }),
    ).toBeNull();
    expect(
      verifyDaemonJwt(token, SECRET, { aud: "panel", nowSec: now }),
    ).toBeNull();
    expect(
      verifyDaemonJwt(token, SECRET, {
        aud: "daemon",
        nodeId: "other",
        nowSec: now,
      }),
    ).toBeNull();
    expect(
      verifyDaemonJwt(token, SECRET, {
        aud: "daemon",
        nowSec: now + 120,
        skewSec: 0,
      }),
    ).toBeNull();
  });

  it("rejects non-JWT strings", () => {
    expect(looksLikeJwt("raw-bearer-token")).toBe(false);
    expect(
      verifyDaemonJwt("raw-bearer-token", SECRET, { aud: "daemon" }),
    ).toBeNull();
  });

  it("rejects empty secret and tampered payload", () => {
    const now = 1_700_000_000;
    const token = signDaemonJwt(SECRET, {
      nodeId: "node_abc",
      aud: "daemon",
      ttlSec: 60,
      nowSec: now,
    });
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const tampered = `${parts[0]}.${Buffer.from('{"aud":"daemon"}').toString("base64url")}.${parts[2]}`;
    expect(
      verifyDaemonJwt(tampered, SECRET, { aud: "daemon", nowSec: now }),
    ).toBeNull();
  });
});
