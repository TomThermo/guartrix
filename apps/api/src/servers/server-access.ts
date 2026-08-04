import { createHash } from "node:crypto";
import type { Server, SubUser } from "@prisma/client";
import {
  ALL_PERMISSIONS_WILDCARD,
  applyLicenseFeatureCeiling,
  hasPermission,
  normalizeLicenseFeatures,
  isServerPermission,
  normalizeLicenseFeatures,
  type AuthUser,
  type ServerPermission,
} from "@msm/shared";
import { prisma } from "../db.js";
import { getCachedLicenseState, validateLicense } from "../license/license.js";

export function parsePermissionsJson(raw: string): string[] {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((p): p is string => typeof p === "string" && isServerPermission(p));
  } catch {
    return [];
  }
}

export function serializePermissions(perms: string[]): string {
  const unique = [...new Set(perms.filter(isServerPermission))];
  return JSON.stringify(unique);
}

export async function findSubUserForAccess(
  serverId: string,
  user: AuthUser,
): Promise<(SubUser & { permissionsList: string[] }) | null> {
  const byUser = await prisma.subUser.findFirst({
    where: { serverId, userId: user.id },
  });
  if (byUser) {
    return { ...byUser, permissionsList: parsePermissionsJson(byUser.permissions) };
  }

  // Match pending invite by email only after the account verified that address
  // (blocks invite hijack when open registration has no SMTP gate).
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const email = dbUser?.email?.trim().toLowerCase();
  if (!email || !dbUser?.emailVerified) return null;

  const byEmail = await prisma.subUser.findFirst({
    where: { serverId, email },
  });
  if (!byEmail) return null;

  // Link account on first access
  if (!byEmail.userId) {
    await prisma.subUser.update({
      where: { id: byEmail.id },
      data: { userId: user.id },
    });
  }

  return {
    ...byEmail,
    userId: byEmail.userId ?? user.id,
    permissionsList: parsePermissionsJson(byEmail.permissions),
  };
}

export async function getServerPermissions(
  user: AuthUser,
  server: Pick<Server, "id" | "ownerId">,
): Promise<string[]> {
  let granted: string[];
  if (user.role === "ADMIN") granted = [ALL_PERMISSIONS_WILDCARD];
  else if (server.ownerId === user.id) granted = [ALL_PERMISSIONS_WILDCARD];
  else {
    const sub = await findSubUserForAccess(server.id, user);
    granted = sub?.permissionsList ?? [];
  }

  try {
    const state = getCachedLicenseState() ?? (await validateLicense(false));
    if (state?.valid) {
      granted = applyLicenseFeatureCeiling(
        granted,
        normalizeLicenseFeatures(state.features ?? null),
      );
    }
  } catch {
    /* license check failure should not widen permissions */
  }
  return granted;
}

/** Explain when license feature groups block an owner/admin action. */
export function permissionDeniedMessage(
  user: AuthUser,
  server: Pick<Server, "ownerId">,
  permissions: string[],
): string {
  const elevated = user.role === "ADMIN" || server.ownerId === user.id;
  if (!elevated) return "Missing permission";
  try {
    const state = getCachedLicenseState();
    const features = normalizeLicenseFeatures(state?.features ?? null);
    if (state?.valid && features != null && permissions.length === 0) {
      return "Missing permission: the license has no feature groups enabled. Open Admin → License or the license admin GUI and set All permissions.";
    }
    if (state?.valid && features != null) {
      return "Missing permission: not included in the current license feature groups. Enable the required group(s) on the license or set All permissions.";
    }
  } catch {
    /* ignore */
  }
  return "Missing permission";
}

/**
 * Batch variant of getServerPermissions for dashboard list — one SubUser query
 * + one license read instead of N findSubUserForAccess round-trips.
 */
export async function getServerPermissionsBatch(
  user: AuthUser,
  servers: Array<Pick<Server, "id" | "ownerId">>,
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (servers.length === 0) return out;

  let features: Parameters<typeof normalizeLicenseFeatures>[0] = null;
  try {
    const state = getCachedLicenseState() ?? (await validateLicense(false));
    if (state?.valid) {
      features = normalizeLicenseFeatures(state.features ?? null);
    }
  } catch {
    /* ignore */
  }

  const ceiling = (granted: string[]) =>
    applyLicenseFeatureCeiling(granted, features);

  if (user.role === "ADMIN") {
    for (const s of servers) out.set(s.id, ceiling([ALL_PERMISSIONS_WILDCARD]));
    return out;
  }

  const needSub: Array<Pick<Server, "id" | "ownerId">> = [];
  for (const s of servers) {
    if (s.ownerId === user.id) {
      out.set(s.id, ceiling([ALL_PERMISSIONS_WILDCARD]));
    } else {
      needSub.push(s);
    }
  }

  if (needSub.length === 0) return out;

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const email =
    dbUser?.emailVerified && dbUser.email
      ? dbUser.email.trim().toLowerCase()
      : null;
  const ids = needSub.map((s) => s.id);

  const subs = await prisma.subUser.findMany({
    where: {
      serverId: { in: ids },
      OR: [
        { userId: user.id },
        ...(email ? [{ email }] : []),
      ],
    },
  });

  const byServer = new Map<string, (typeof subs)[number]>();
  for (const sub of subs) {
    const existing = byServer.get(sub.serverId);
    // Prefer rows already linked to this userId over email-only invites.
    if (!existing || (sub.userId === user.id && existing.userId !== user.id)) {
      byServer.set(sub.serverId, sub);
    }
  }

  const linkIds: string[] = [];
  for (const s of needSub) {
    const sub = byServer.get(s.id);
    if (!sub) {
      out.set(s.id, ceiling([]));
      continue;
    }
    if (!sub.userId) linkIds.push(sub.id);
    out.set(s.id, ceiling(parsePermissionsJson(sub.permissions)));
  }

  if (linkIds.length > 0) {
    await prisma.subUser
      .updateMany({
        where: { id: { in: linkIds } },
        data: { userId: user.id },
      })
      .catch(() => undefined);
  }

  return out;
}

export async function userCanAccessServer(
  user: AuthUser,
  server: Pick<Server, "id" | "ownerId">,
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (server.ownerId === user.id) return true;
  const sub = await findSubUserForAccess(server.id, user);
  return Boolean(sub);
}

export async function userHasServerPermission(
  user: AuthUser,
  server: Pick<Server, "id" | "ownerId">,
  required: ServerPermission | ServerPermission[],
): Promise<boolean> {
  const granted = await getServerPermissions(user, server);
  return hasPermission(granted, required);
}

export function isServerOwner(
  user: AuthUser,
  server: Pick<Server, "ownerId">,
): boolean {
  if (user.role === "ADMIN") return true;
  return server.ownerId === user.id;
}

export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function usernameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  const cleaned = local.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 24);
  const base = cleaned || "user";
  return base.length >= 3 ? base : `${base}user`;
}

export function hashInviteToken(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** After login, attach any pending subuser rows for this email. */
export async function linkPendingSubUsers(userId: string, email: string | null | undefined): Promise<void> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return;
  await prisma.subUser.updateMany({
    where: { email: normalized, userId: null },
    data: { userId },
  });
}

export interface ResolvedServerAccess {
  server: Server;
  permissions: string[];
  isOwner: boolean;
}

/** Resolve server + permissions for a user, or null if no access. */
export async function resolveServerAccess(
  user: AuthUser,
  serverId: string,
): Promise<ResolvedServerAccess | null> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) return null;
  if (!(await userCanAccessServer(user, server))) return null;
  const permissions = await getServerPermissions(user, server);
  return {
    server,
    permissions,
    isOwner: isServerOwner(user, server),
  };
}

export function hasServerPermission(
  access: Pick<ResolvedServerAccess, "permissions">,
  required: ServerPermission | ServerPermission[],
): boolean {
  return hasPermission(access.permissions, required);
}

/** Servers the user may see (owner / subuser / admin), optionally API-key scoped. */
export async function listVisibleServers(
  user: AuthUser,
  request?: { apiKeyAuth?: { serverIds: string[] | null } | null },
) {
  const { serverListInclude } = await import("./serialize.js");
  let rows;
  if (user.role === "ADMIN") {
    rows = await prisma.server.findMany({
      orderBy: { createdAt: "desc" },
      include: serverListInclude,
    });
  } else {
    rows = await prisma.server.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { subUsers: { some: { userId: user.id } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: serverListInclude,
    });
  }
  const allow = request?.apiKeyAuth?.serverIds;
  if (allow) {
    const set = new Set(allow);
    rows = rows.filter((s) => set.has(s.id));
  }
  return rows;
}

/** Same visibility as listVisibleServers, ids only (dashboard bulk polls). */
export async function listVisibleServerIds(
  user: AuthUser,
  request?: { apiKeyAuth?: { serverIds: string[] | null } | null },
): Promise<string[]> {
  let ids: string[];
  if (user.role === "ADMIN") {
    const rows = await prisma.server.findMany({ select: { id: true } });
    ids = rows.map((r) => r.id);
  } else {
    const rows = await prisma.server.findMany({
      where: {
        OR: [
          { ownerId: user.id },
          { subUsers: { some: { userId: user.id } } },
        ],
      },
      select: { id: true },
    });
    ids = rows.map((r) => r.id);
  }
  const allow = request?.apiKeyAuth?.serverIds;
  if (allow) {
    const set = new Set(allow);
    ids = ids.filter((id) => set.has(id));
  }
  return ids;
}
