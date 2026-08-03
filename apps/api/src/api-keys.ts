import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import {
  API_KEY_RATE_DEFAULT,
  API_KEY_RATE_WINDOW_MS,
  type ApiKeyRecord,
} from "@msm/shared";
import { prisma } from "./db.js";
import { getRateLimitStore } from "./rate-limit-store.js";

export interface ApiKeyAuthContext {
  keyId: string;
  userId: string;
  prefix: string;
  permissions: string[];
  /** null = every server the user can access. */
  serverIds: string[] | null;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set when the request authenticated via a personal API key. */
    apiKeyAuth?: ApiKeyAuthContext;
  }
}

const TOKEN_PREFIX = "gt_";

export function hashApiKeyToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Cryptographically random Client API token. Shown once. */
export function generateApiKeyToken(): { token: string; prefix: string; tokenHash: string } {
  const body = randomBytes(24).toString("base64url");
  const token = `${TOKEN_PREFIX}${body}`;
  const prefix = token.slice(0, 12);
  return { token, prefix, tokenHash: hashApiKeyToken(token) };
}

export function parsePermissionsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function parseServerIdsJson(raw: string | null): string[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export function toApiKeyRecord(row: {
  id: string;
  name: string;
  prefix: string;
  permissions: string;
  serverIds: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    permissions: parsePermissionsJson(row.permissions),
    serverIds: parseServerIdsJson(row.serverIds),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** Intersect account server perms with key scopes. */
export function intersectPermissions(
  userPerms: readonly string[],
  keyPerms: readonly string[],
): string[] {
  if (keyPerms.includes("*")) return [...userPerms];
  if (userPerms.includes("*")) return [...keyPerms];
  return keyPerms.filter((p) => userPerms.includes(p));
}

function extractBearer(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (typeof auth !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return match?.[1] ?? null;
}

/** In-memory / file-backed per-key sliding window. */
function apiKeyRateLimit(): number {
  const raw = Number(process.env.API_KEY_RATE_LIMIT ?? API_KEY_RATE_DEFAULT);
  if (!Number.isFinite(raw) || raw < 1) return API_KEY_RATE_DEFAULT;
  return Math.floor(raw);
}

/**
 * Returns an error message when over limit, else null.
 * Call after a successful key lookup.
 */
export function checkApiKeyRate(keyId: string): string | null {
  const limit = apiKeyRateLimit();
  const { limited } = getRateLimitStore().hit(
    `apikey:${keyId}`,
    API_KEY_RATE_WINDOW_MS,
    limit,
  );
  if (limited) {
    return `API key rate limit exceeded (${limit}/min)`;
  }
  return null;
}

/**
 * Resolve a personal Client API key from Authorization: Bearer gt_…
 * Daemon tokens (hex) are ignored here — internal routes validate those themselves.
 */
export async function resolveApiKeyAuth(
  request: FastifyRequest,
): Promise<{ userId: string; ctx: ApiKeyAuthContext } | null> {
  const token = extractBearer(request);
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashApiKeyToken(token);
  const row = await prisma.apiKey.findUnique({
    where: { tokenHash },
    include: { user: { select: { role: true, totpEnabled: true } } },
  });
  if (!row || row.revokedAt) return null;

  // Roles in TWO_FACTOR_REQUIRED_ROLES must enroll TOTP before API keys work.
  const required = (process.env.TWO_FACTOR_REQUIRED_ROLES ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (
    required.includes(String(row.user.role).toUpperCase()) &&
    !row.user.totpEnabled
  ) {
    (request as FastifyRequest & { apiKeyRateLimited?: string }).apiKeyRateLimited =
      "Two-factor authentication is required for this account before API keys can be used";
    return null;
  }

  const limited = checkApiKeyRate(row.id);
  if (limited) {
    (request as FastifyRequest & { apiKeyRateLimited?: string }).apiKeyRateLimited =
      limited;
    return null;
  }

  // Fire-and-forget last-used touch (don't block the request).
  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  const ctx: ApiKeyAuthContext = {
    keyId: row.id,
    userId: row.userId,
    prefix: row.prefix,
    permissions: parsePermissionsJson(row.permissions),
    serverIds: parseServerIdsJson(row.serverIds),
  };
  request.apiKeyAuth = ctx;
  return { userId: row.userId, ctx };
}

export function apiKeyRateLimitedMessage(request: FastifyRequest): string | null {
  return (
    (request as FastifyRequest & { apiKeyRateLimited?: string }).apiKeyRateLimited ??
    null
  );
}

/** Whether this API key may touch the given server id. */
export function apiKeyAllowsServer(
  ctx: ApiKeyAuthContext | undefined,
  serverId: string,
): boolean {
  if (!ctx) return true;
  if (ctx.serverIds == null) return true;
  return ctx.serverIds.includes(serverId);
}
