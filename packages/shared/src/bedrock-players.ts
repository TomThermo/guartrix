/** Mojang BDS player files (allowlist.json, permissions.json). */

export interface BdsAllowlistEntry {
  name: string;
  xuid?: string;
  ignoresPlayerLimit?: boolean;
}

export type BdsPermissionLevel = "operator" | "member" | "visitor";

export interface BdsPermissionEntry {
  permission: BdsPermissionLevel;
  xuid: string;
}

/** Xbox gamertag as used by BDS allowlist (not Mojang Java username rules). */
export function validateBedrockGamertag(name: string): string {
  const cleaned = name.trim();
  if (cleaned.length < 1 || cleaned.length > 15) {
    throw new Error("Xbox gamertag must be 1–15 characters");
  }
  if (/[\x00-\x1f\x7f]/.test(cleaned)) {
    throw new Error("Invalid gamertag characters");
  }
  return cleaned;
}

/** Quote a gamertag for BDS console commands when it contains spaces. */
export function bdsConsoleGamertagArg(name: string): string {
  if (/[\s"\\]/.test(name)) {
    return `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return name;
}

export function parseBdsAllowlistJson(raw: string): BdsAllowlistEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const data = JSON.parse(trimmed) as unknown;
  let arr: unknown[];
  if (Array.isArray(data)) {
    arr = data;
  } else if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { allowlist?: unknown[] }).allowlist)
  ) {
    arr = (data as { allowlist: unknown[] }).allowlist;
  } else {
    return [];
  }
  return arr
    .filter(
      (e): e is Record<string, unknown> =>
        typeof e === "object" && e !== null,
    )
    .map((e) => ({
      name: String(e.name ?? "").trim(),
      ...(e.xuid ? { xuid: String(e.xuid) } : {}),
      ignoresPlayerLimit: Boolean(e.ignoresPlayerLimit),
    }))
    .filter((e) => e.name.length > 0);
}

export function serializeBdsAllowlist(entries: BdsAllowlistEntry[]): string {
  const normalized = entries.map((e) => ({
    ignoresPlayerLimit: e.ignoresPlayerLimit ?? false,
    name: e.name,
    ...(e.xuid ? { xuid: e.xuid } : {}),
  }));
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function parseBdsPermissionsJson(raw: string): BdsPermissionEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const data = JSON.parse(trimmed) as unknown;
  if (!Array.isArray(data)) return [];
  return data
    .filter((e): e is Record<string, unknown> => e && typeof e === "object")
    .map((e) => ({
      permission: String(e.permission ?? "member") as BdsPermissionLevel,
      xuid: String(e.xuid ?? "").trim(),
    }))
    .filter((e) => e.xuid.length > 0);
}

export function serializeBdsPermissions(entries: BdsPermissionEntry[]): string {
  return `${JSON.stringify(entries, null, 2)}\n`;
}
