import path from "node:path";
import type { ServerExtraMount } from "@msm/shared";
import { Prisma, type Prisma as PrismaNS } from "@prisma/client";

export const MAX_EXTRA_MOUNTS = 8;

const DEFAULT_ALLOW_PREFIXES = [
  "/var/lib/guartrix/shared",
  "/opt/guartrix/shared",
];

export function extraMountsAllowPrefixes(): string[] {
  const raw = process.env.EXTRA_MOUNTS_ALLOW_PREFIX?.trim();
  if (!raw) return [...DEFAULT_ALLOW_PREFIXES];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.posix.normalize(p.replace(/\\/g, "/")));
}

function hasPathEscape(p: string): boolean {
  if (p.includes("\0") || p.includes("\r") || p.includes("\n")) return true;
  const parts = p.split("/");
  return parts.some((seg) => seg === "..");
}

function normalizeAbsolutePath(raw: string, label: string): string {
  const trimmed = raw.trim().replace(/\\/g, "/");
  if (!trimmed.startsWith("/")) {
    throw new Error(`${label} must be an absolute path`);
  }
  if (trimmed === "/" || trimmed === "//") {
    throw new Error(`${label} cannot be /`);
  }
  if (hasPathEscape(trimmed)) {
    throw new Error(`${label} must not contain .. or control characters`);
  }
  const normalized = path.posix.normalize(trimmed);
  if (!normalized.startsWith("/") || normalized === "/") {
    throw new Error(`${label} must be an absolute path`);
  }
  if (hasPathEscape(normalized) || normalized.includes("..")) {
    throw new Error(`${label} must not contain ..`);
  }
  return normalized;
}

function hostAllowed(host: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => {
    const p = path.posix.normalize(prefix);
    if (p === "/") return false;
    return host === p || host.startsWith(`${p}/`);
  });
}

/**
 * Validate and normalize extra mounts from API input.
 * Returns null when mounts are cleared; throws on invalid input.
 */
export function parseExtraMounts(input: unknown): ServerExtraMount[] | null {
  if (input === null) return null;
  if (!Array.isArray(input)) {
    throw new Error("extraMounts must be an array or null");
  }
  if (input.length > MAX_EXTRA_MOUNTS) {
    throw new Error(`At most ${MAX_EXTRA_MOUNTS} extra mounts are allowed`);
  }
  if (input.length === 0) return null;

  const prefixes = extraMountsAllowPrefixes();
  if (prefixes.length === 0) {
    throw new Error("EXTRA_MOUNTS_ALLOW_PREFIX has no valid prefixes");
  }

  const seenContainers = new Set<string>();
  const out: ServerExtraMount[] = [];

  for (let i = 0; i < input.length; i++) {
    const row = input[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`extraMounts[${i}] must be an object`);
    }
    const rec = row as Record<string, unknown>;
    if (typeof rec.host !== "string" || typeof rec.container !== "string") {
      throw new Error(`extraMounts[${i}] requires host and container strings`);
    }
    if (rec.readOnly !== undefined && typeof rec.readOnly !== "boolean") {
      throw new Error(`extraMounts[${i}].readOnly must be a boolean`);
    }

    const host = normalizeAbsolutePath(rec.host, `extraMounts[${i}].host`);
    const container = normalizeAbsolutePath(
      rec.container,
      `extraMounts[${i}].container`,
    );

    if (container === "/data" || container.startsWith("/data/")) {
      throw new Error(
        `extraMounts[${i}].container cannot use /data (reserved for server files)`,
      );
    }
    if (!hostAllowed(host, prefixes)) {
      throw new Error(
        `extraMounts[${i}].host must be under an allowed prefix (${prefixes.join(", ")})`,
      );
    }
    if (seenContainers.has(container)) {
      throw new Error(`Duplicate container path: ${container}`);
    }
    seenContainers.add(container);

    const mount: ServerExtraMount = { host, container };
    if (rec.readOnly === true) mount.readOnly = true;
    out.push(mount);
  }

  return out;
}

/** Coerce Prisma Json column → typed mounts (shape only; no allowlist). */
export function coerceExtraMounts(
  value: PrismaNS.JsonValue | null | undefined,
): ServerExtraMount[] | null {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: ServerExtraMount[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.host !== "string" || typeof rec.container !== "string") {
      continue;
    }
    const mount: ServerExtraMount = {
      host: rec.host,
      container: rec.container,
    };
    if (rec.readOnly === true) mount.readOnly = true;
    out.push(mount);
  }
  return out.length > 0 ? out : null;
}

export function extraMountsForPrisma(
  mounts: ServerExtraMount[] | null,
): PrismaNS.InputJsonValue | typeof Prisma.DbNull {
  if (mounts == null || mounts.length === 0) return Prisma.DbNull;
  return mounts as unknown as PrismaNS.InputJsonValue;
}
