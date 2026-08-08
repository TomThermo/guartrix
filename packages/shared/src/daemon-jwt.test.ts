import { afterEach, describe, expect, it } from "vitest";
import {
  daemonToPanelAuthorization,
  daemonJwtLegacyBearerEnabled,
  daemonJwtTtlSec,
  daemonJwtWsTtlSec,
  decodeDaemonJwtPayload,
  looksLikeJwt,
  panelToDaemonAuthorization,
  safeEqualString,
  signDaemonJwt,
  verifyDaemonJwt,
} from "./daemon-jwt.js";

const SECRET = "unit-test-daemon-secret-value";
const ORIGINAL_ENV = {
  DAEMON_JWT_TTL: process.env.DAEMON_JWT_TTL,
  DAEMON_JWT_WS_TTL: process.env.DAEMON_JWT_WS_TTL,
  DAEMON_JWT_LEGACY: process.env.DAEMON_JWT_LEGACY,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("daemon JWT", () => {
  it("defaults and clamps the HTTP JWT TTL", () => {
    delete process.env.DAEMON_JWT_TTL;
    expect(daemonJwtTtlSec()).toBe(900);

    process.env.DAEMON_JWT_TTL = "59";
    expect(daemonJwtTtlSec()).toBe(900);
    process.env.DAEMON_JWT_TTL = "not-a-number";
    expect(daemonJwtTtlSec()).toBe(900);
    process.env.DAEMON_JWT_TTL = "120.9";
    expect(daemonJwtTtlSec()).toBe(120);
    process.env.DAEMON_JWT_TTL = "999999";
    expect(daemonJwtTtlSec()).toBe(86_400);
  });

  it("defaults and clamps the WebSocket JWT TTL", () => {
    delete process.env.DAEMON_JWT_WS_TTL;
    expect(daemonJwtWsTtlSec()).toBe(3600);

    process.env.DAEMON_JWT_WS_TTL = "0";
    expect(daemonJwtWsTtlSec()).toBe(3600);
    process.env.DAEMON_JWT_WS_TTL = "invalid";
    expect(daemonJwtWsTtlSec()).toBe(3600);
    process.env.DAEMON_JWT_WS_TTL = "600.8";
    expect(daemonJwtWsTtlSec()).toBe(600);
    process.env.DAEMON_JWT_WS_TTL = "100000";
    expect(daemonJwtWsTtlSec()).toBe(86_400);
  });

  it("keeps legacy bearer auth disabled unless explicitly enabled", () => {
    delete process.env.DAEMON_JWT_LEGACY;
    expect(daemonJwtLegacyBearerEnabled()).toBe(false);

    for (const value of ["1", "true", "yes", "TRUE", "Yes"]) {
      process.env.DAEMON_JWT_LEGACY = value;
      expect(daemonJwtLegacyBearerEnabled()).toBe(true);
    }

    process.env.DAEMON_JWT_LEGACY = "on";
    expect(daemonJwtLegacyBearerEnabled()).toBe(false);
  });

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
    expect(verifyDaemonJwt(token, SECRET, { aud: "panel", nowSec: now })).toBeNull();
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
    expect(verifyDaemonJwt("raw-bearer-token", SECRET, { aud: "daemon" })).toBeNull();
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
    expect(verifyDaemonJwt(tampered, SECRET, { aud: "daemon", nowSec: now })).toBeNull();
  });

  it("decodes payloads and rejects malformed claims", () => {
    const token = signDaemonJwt(SECRET, {
      nodeId: "node_abc",
      aud: "panel",
      ttlSec: 60,
      nowSec: 1_700_000_000,
    });
    expect(decodeDaemonJwtPayload(token)).toMatchObject({
      aud: "panel",
      nid: "node_abc",
    });
    expect(decodeDaemonJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeDaemonJwtPayload("a.invalid-json.c")).toBeNull();
    const incomplete = `a.${Buffer.from('{"nid":"node_abc"}').toString("base64url")}.c`;
    expect(decodeDaemonJwtPayload(incomplete)).toBeNull();
  });

  it("builds both authorization token audiences and compares secrets safely", () => {
    const daemonToken = panelToDaemonAuthorization("node_abc", SECRET, {
      ttlSec: 60,
    });
    const panelToken = daemonToPanelAuthorization("node_abc", SECRET, {
      ttlSec: 60,
    });
    expect(decodeDaemonJwtPayload(daemonToken)?.aud).toBe("daemon");
    expect(decodeDaemonJwtPayload(panelToken)?.aud).toBe("panel");
    expect(safeEqualString("same", "same")).toBe(true);
    expect(safeEqualString("short", "longer")).toBe(false);
    expect(safeEqualString("same", "diff")).toBe(false);
  });
});
