import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import {
  APPLICATION_API_RATE_DEFAULT,
  APPLICATION_API_RATE_WINDOW_MS,
  type ApplicationApiKeyRecord,
} from "@guartrix/shared";
import { prisma } from "../db.js";
import { getRateLimitStore } from "../rate-limit-store.js";

export interface ApplicationAuthContext {
  keyId: string;
  prefix: string;
  scopes: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    applicationAuth?: ApplicationAuthContext;
  }
}

const TOKEN_PREFIX = "gta_";

export function hashApplicationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateApplicationToken(): {
  token: string;
  prefix: string;
  tokenHash: string;
} {
  const body = randomBytes(24).toString("base64url");
  const token = `${TOKEN_PREFIX}${body}`;
  const prefix = token.slice(0, 12);
  return { token, prefix, tokenHash: hashApplicationToken(token) };
}

export function parseScopesJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export function toApplicationKeyRecord(row: {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  note: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}): ApplicationApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: parseScopesJson(row.scopes),
    note: row.note,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

function extractBearer(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (typeof auth !== "string") return null;
  const match = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return match?.[1] ?? null;
}

function applicationRateLimit(): number {
  const raw = Number(process.env.APPLICATION_API_RATE_LIMIT ?? APPLICATION_API_RATE_DEFAULT);
  if (!Number.isFinite(raw) || raw < 1) return APPLICATION_API_RATE_DEFAULT;
  return Math.floor(raw);
}

export async function checkApplicationKeyRate(keyId: string): Promise<string | null> {
  const limit = applicationRateLimit();
  const result = await getRateLimitStore().hit(
    `appkey:${keyId}`,
    APPLICATION_API_RATE_WINDOW_MS,
    limit,
  );
  if (result.limited) {
    return `Application API rate limit exceeded (${limit}/min)`;
  }
  return null;
}

export async function resolveApplicationAuth(
  request: FastifyRequest,
): Promise<ApplicationAuthContext | null> {
  const token = extractBearer(request);
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashApplicationToken(token);
  const row = await prisma.applicationApiKey.findUnique({ where: { tokenHash } });
  if (!row || row.revokedAt) return null;

  const limited = await checkApplicationKeyRate(row.id);
  if (limited) {
    (request as FastifyRequest & { applicationRateLimited?: string }).applicationRateLimited =
      limited;
    return null;
  }

  void prisma.applicationApiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  const ctx: ApplicationAuthContext = {
    keyId: row.id,
    prefix: row.prefix,
    scopes: parseScopesJson(row.scopes),
  };
  request.applicationAuth = ctx;
  return ctx;
}

export function applicationRateLimitedMessage(request: FastifyRequest): string | null {
  return (
    (request as FastifyRequest & { applicationRateLimited?: string }).applicationRateLimited ?? null
  );
}

export function applicationHasScope(ctx: ApplicationAuthContext, scope: string): boolean {
  if (ctx.scopes.includes("*")) return true;
  return ctx.scopes.includes(scope);
}
