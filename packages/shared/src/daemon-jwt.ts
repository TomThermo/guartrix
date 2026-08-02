/**
 * Wings-style short-lived daemon access JWTs (HS256).
 * Long-lived DAEMON_TOKEN remains the HMAC secret (+ optional legacy bearer).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const DAEMON_JWT_ISS = "guartrix";
export type DaemonJwtAudience = "daemon" | "panel";

export interface DaemonJwtClaims {
  iss: string;
  aud: DaemonJwtAudience;
  /** Node id */
  nid: string;
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlJson(value: unknown): string {
  return b64url(JSON.stringify(value));
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function looksLikeJwt(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

/** Default HTTP JWT lifetime (seconds). */
export function daemonJwtTtlSec(): number {
  const n = Number(process.env.DAEMON_JWT_TTL ?? 900);
  if (!Number.isFinite(n) || n < 60) return 900;
  return Math.min(86_400, Math.floor(n));
}

/** Longer TTL for WebSocket handshakes (seconds). */
export function daemonJwtWsTtlSec(): number {
  const n = Number(process.env.DAEMON_JWT_WS_TTL ?? 3600);
  if (!Number.isFinite(n) || n < 60) return 3600;
  return Math.min(86_400, Math.floor(n));
}

/** When false, only JWTs are accepted (no raw long-lived bearer on the wire). */
export function daemonJwtLegacyBearerEnabled(): boolean {
  const v = (process.env.DAEMON_JWT_LEGACY ?? "false").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function signDaemonJwt(
  secret: string,
  input: {
    nodeId: string;
    aud: DaemonJwtAudience;
    ttlSec?: number;
    nowSec?: number;
  },
): string {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const ttl = input.ttlSec ?? daemonJwtTtlSec();
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const payload = b64urlJson({
    iss: DAEMON_JWT_ISS,
    aud: input.aud,
    nid: input.nodeId,
    iat: now,
    exp: now + ttl,
  } satisfies DaemonJwtClaims);
  const data = `${header}.${payload}`;
  const sig = b64url(
    createHmac("sha256", secret).update(data, "utf8").digest(),
  );
  return `${data}.${sig}`;
}

export function decodeDaemonJwtPayload(
  token: string,
): DaemonJwtClaims | null {
  if (!looksLikeJwt(token)) return null;
  try {
    const payload = JSON.parse(
      fromB64url(token.split(".")[1]!).toString("utf8"),
    ) as Partial<DaemonJwtClaims>;
    if (
      typeof payload.nid !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }
    return {
      iss: typeof payload.iss === "string" ? payload.iss : DAEMON_JWT_ISS,
      aud: payload.aud === "panel" ? "panel" : "daemon",
      nid: payload.nid,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function verifyDaemonJwt(
  token: string,
  secret: string,
  opts: {
    aud: DaemonJwtAudience;
    /** If set, claims.nid must match. */
    nodeId?: string;
    nowSec?: number;
    /** Clock skew allowance (seconds). */
    skewSec?: number;
  },
): DaemonJwtClaims | null {
  if (!looksLikeJwt(token)) return null;
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const data = `${h}.${p}`;
  const expected = createHmac("sha256", secret).update(data, "utf8").digest();
  let actual: Buffer;
  try {
    actual = fromB64url(s);
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let claims: DaemonJwtClaims;
  try {
    const raw = JSON.parse(fromB64url(p).toString("utf8")) as DaemonJwtClaims;
    claims = raw;
  } catch {
    return null;
  }

  if (claims.iss !== DAEMON_JWT_ISS) return null;
  if (claims.aud !== opts.aud) return null;
  if (typeof claims.nid !== "string" || !claims.nid) return null;
  if (opts.nodeId && claims.nid !== opts.nodeId) return null;
  if (typeof claims.exp !== "number" || typeof claims.iat !== "number") {
    return null;
  }
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const skew = opts.skewSec ?? 30;
  if (claims.exp + skew < now) return null;
  if (claims.iat - skew > now) return null;
  return claims;
}

/** Constant-time compare for legacy long-lived bearers. */
export function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Panel → daemon Authorization value (short-lived JWT).
 * Falls back to raw secret only when JWT issuance is impossible.
 */
export function panelToDaemonAuthorization(
  nodeId: string,
  secret: string,
  opts?: { ttlSec?: number },
): string {
  return signDaemonJwt(secret, {
    nodeId,
    aud: "daemon",
    ttlSec: opts?.ttlSec,
  });
}

/** Daemon → panel Authorization value (short-lived JWT). */
export function daemonToPanelAuthorization(
  nodeId: string,
  secret: string,
  opts?: { ttlSec?: number },
): string {
  return signDaemonJwt(secret, {
    nodeId,
    aud: "panel",
    ttlSec: opts?.ttlSec,
  });
}
