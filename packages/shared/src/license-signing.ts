import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  timingSafeEqual,
} from "node:crypto";

/** Fields included in the signed validate payload (v1). */
export type LicenseSignedClaims = {
  v: 1;
  valid: boolean;
  status: string;
  expiresAt: string | null;
  /** SHA-256 hex of the license key (never the raw key). */
  keyHash: string;
  installId: string | null;
  /** Primary / first bound IP (compat). */
  boundIp: string | null;
  /** All allowed IPs for this license (sorted in canonical form). */
  boundIps: string[];
  maxServers: number | null;
  maxNodes: number | null;
  maxMemoryMb: number | null;
  maxMemoryMbPerServer: number | null;
  /**
   * Enabled permission-group ids. `null` = all features.
   * Sorted when present for canonical signing.
   */
  features: string[] | null;
  /** Issued-at unix seconds */
  iat: number;
  /** Expiry of this signature unix seconds */
  exp: number;
};

export function hashLicenseKey(key: string): string {
  return createHash("sha256").update(key.trim(), "utf8").digest("hex");
}

/** Deterministic JSON for signing (sorted keys). */
export function canonicalizeClaims(claims: LicenseSignedClaims): string {
  const ordered: Record<string, unknown> = {
    boundIp: claims.boundIp,
    boundIps: [...(claims.boundIps ?? [])].slice().sort(),
    exp: claims.exp,
    expiresAt: claims.expiresAt,
    features: claims.features == null ? null : [...claims.features].slice().sort(),
    iat: claims.iat,
    installId: claims.installId,
    keyHash: claims.keyHash,
    maxMemoryMb: claims.maxMemoryMb,
    maxMemoryMbPerServer: claims.maxMemoryMbPerServer,
    maxNodes: claims.maxNodes,
    maxServers: claims.maxServers,
    status: claims.status,
    v: claims.v,
    valid: claims.valid,
  };
  return JSON.stringify(ordered);
}

export function signLicenseClaims(privateKeyPem: string, claims: LicenseSignedClaims): string {
  const key = createPrivateKey(privateKeyPem);
  const sig = sign(null, Buffer.from(canonicalizeClaims(claims), "utf8"), key);
  return sig.toString("base64url");
}

export function verifyLicenseClaims(
  publicKeyPem: string,
  claims: LicenseSignedClaims,
  signature: string,
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return verify(
      null,
      Buffer.from(canonicalizeClaims(claims), "utf8"),
      key,
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}

export function generateEd25519PemPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/** Constant-time string compare for secrets. */
export function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    timingSafeEqual(ba.length ? ba : Buffer.from([0]), ba.length ? ba : Buffer.from([0]));
    return false;
  }
  return timingSafeEqual(ba, bb);
}
