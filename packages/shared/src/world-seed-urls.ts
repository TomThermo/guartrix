/**
 * Shared Minecraft seed-map URL helpers (mcseedmap.net + Chunkbase).
 */

/** Map panel MC version → mcseedmap.net path segment (`1.21.4-Java`). */
export function mcseedmapVersion(mcVersion: string): string {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mcVersion.trim());
  if (!m) return "1.21.4-Java";
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = m[3] != null ? Number(m[3]) : 0;
  return `${major}.${minor}.${patch}-Java`;
}

/**
 * Map panel MC version → Chunkbase `platform` token.
 * @see https://www.chunkbase.com/apps/seed-map
 */
export function seedMapPlatform(mcVersion: string): string {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(mcVersion.trim());
  if (!m) return "java_1_21";
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = m[3] != null ? Number(m[3]) : 0;

  if (major >= 26) {
    if (minor >= 3) return "java_26_3";
    if (minor >= 2) return "java_26_2";
    return "java_26_1";
  }
  if (major >= 25) return "java_26_1";

  if (major === 1 && minor === 21) {
    if (patch >= 9) return "java_1_21_9";
    if (patch >= 6) return "java_1_21_6";
    if (patch === 5) return "java_1_21_5";
    if (patch === 4) return "java_1_21_4";
    if (patch >= 2) return "java_1_21_2";
    return "java_1_21";
  }
  if (major === 1 && minor === 20) return "java_1_20";
  if (major === 1 && minor === 19) {
    return patch >= 3 ? "java_1_19_3" : "java_1_19";
  }
  if (major === 1 && minor >= 7 && minor <= 18) return `java_1_${minor}`;
  return "java_1_21";
}

/** In-panel iframe target (mcseedmap.net allows framing). */
export function buildSeedMapUrl(seed: string, mcVersion: string): string {
  const version = encodeURIComponent(mcseedmapVersion(mcVersion));
  const seedSeg = encodeURIComponent(seed);
  return `https://mcseedmap.net/${version}/${seedSeg}`;
}

/** Full Chunkbase UI for “open in new tab”. */
export function buildExternalSeedMapUrl(
  seed: string,
  mcVersion: string,
): string {
  const platform = seedMapPlatform(mcVersion);
  const hash = [
    `seed=${encodeURIComponent(seed)}`,
    `platform=${encodeURIComponent(platform)}`,
    "dimension=overworld",
    "x=0",
    "z=0",
    "zoom=0.5",
    "showBiomes=true",
    "terrain=true",
  ].join("&");
  return `https://www.chunkbase.com/apps/seed-map#${hash}`;
}
