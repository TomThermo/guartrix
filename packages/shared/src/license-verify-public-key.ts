/**
 * Official Guartrix license-server Ed25519 **public** verify key.
 * Safe to ship in source and customer builds — never the private signing key.
 *
 * Used when `LICENSE_VERIFY_PUBLIC_KEY` / `data/licenses/signing-public.pem` are unset
 * so git checkouts and incomplete installs still verify signed validate responses.
 */
export const GUARTRIX_LICENSE_VERIFY_PUBLIC_KEY_PEM =
  "-----BEGIN PUBLIC KEY-----\n" +
  "MCowBQYDK2VwAyEA9b4z3kFM5ojAUxz3jZk+f8vz6KKts96TXoX04SCx+BA=\n" +
  "-----END PUBLIC KEY-----\n";

/** Normalize env or file PEM (full PEM or base64 SPKI body). */
export function normalizeLicenseVerifyPublicKeyPem(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("BEGIN")) return t.endsWith("\n") ? t : `${t}\n`;
  return `-----BEGIN PUBLIC KEY-----\n${t}\n-----END PUBLIC KEY-----\n`;
}

/**
 * Resolve verify key: env → on-disk PEM → baked-in Guartrix default.
 */
export function resolveLicenseVerifyPublicKeyPem(opts: {
  envPem?: string | null;
  filePem?: string | null;
}): string {
  const fromEnv = opts.envPem?.trim();
  if (fromEnv) return normalizeLicenseVerifyPublicKeyPem(fromEnv);
  const fromFile = opts.filePem?.trim();
  if (fromFile) return normalizeLicenseVerifyPublicKeyPem(fromFile);
  return GUARTRIX_LICENSE_VERIFY_PUBLIC_KEY_PEM;
}
