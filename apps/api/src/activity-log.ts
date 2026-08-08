import type { FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import { activityActionMeta, type ActivityEventRecord, type ActivityCategory } from "@msm/shared";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { notifyCriticalActivity } from "./notifications.js";

/** Metadata keys that must never reach the log, however they are nested. */
const SECRET_KEY_PATTERN = /pass|secret|token|credential|authorization|cookie|hash/i;
const METADATA_MAX_CHARS = 4000;
const VALUE_MAX_CHARS = 300;

export interface RecordActivityInput {
  action: string;
  /** Session request; used for the actor IP. */
  request?: FastifyRequest;
  /** Acting user; omit for automation (see `actor`). */
  user?: { id: string; username: string } | null;
  server?: { id: string; name: string } | null;
  serverId?: string | null;
  serverName?: string | null;
  /** Actor label when there is no user, e.g. "system" or "scheduler". */
  actor?: string;
  /** False for denied or failed attempts. */
  success?: boolean;
  metadata?: Record<string, unknown>;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > VALUE_MAX_CHARS ? `${value.slice(0, VALUE_MAX_CHARS)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeValue);
  return undefined;
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(metadata)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    const value = sanitizeValue(raw);
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  if (Object.keys(out).length === 0) return null;
  const json = JSON.stringify(out);
  return json.length > METADATA_MAX_CHARS ? json.slice(0, METADATA_MAX_CHARS) : json;
}

function parseMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Append an event to the activity log. Never throws — a broken audit write must
 * not fail the action the user asked for.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    const meta = activityActionMeta(input.action);
    const serverId = input.server?.id ?? input.serverId ?? null;
    let serverName = input.server?.name ?? input.serverName ?? null;
    if (serverId && !serverName) {
      const row = await prisma.server
        .findUnique({ where: { id: serverId }, select: { name: true } })
        .catch(() => null);
      serverName = row?.name ?? null;
    }
    const event = await prisma.activityEvent.create({
      data: {
        id: nanoid(12),
        action: input.action,
        category: meta.category,
        serverId,
        serverName,
        userId: input.user?.id ?? null,
        actorName: input.user?.username ?? input.actor ?? "system",
        actorIp: input.request?.ip ?? null,
        success: input.success ?? true,
        metadata: sanitizeMetadata(input.metadata),
      },
    });
    if (meta.critical) {
      void notifyCriticalActivity(toActivityRecord(event));
    }
  } catch (err) {
    console.warn(
      `[guartrix] Activity log write failed (${input.action}):`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Fire-and-forget variant for handlers that should not await the audit write. */
export function logActivity(input: RecordActivityInput): void {
  void recordActivity(input);
}

interface ActivityRow {
  id: string;
  action: string;
  category: string;
  serverId: string | null;
  serverName: string | null;
  userId: string | null;
  actorName: string;
  actorIp: string | null;
  success: boolean;
  metadata: string | null;
  createdAt: Date;
}

export function toActivityRecord(row: ActivityRow): ActivityEventRecord {
  return {
    id: row.id,
    action: row.action,
    category: row.category as ActivityCategory,
    label: activityActionMeta(row.action).label,
    serverId: row.serverId,
    serverName: row.serverName,
    userId: row.userId,
    actorName: row.actorName,
    actorIp: row.actorIp,
    success: row.success,
    metadata: parseMetadata(row.metadata),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Days to keep events; 0 = keep forever. */
export function activityRetentionDays(): number {
  const raw = Number(process.env.ACTIVITY_LOG_RETENTION_DAYS ?? 90);
  if (!Number.isFinite(raw) || raw < 0) return 90;
  return Math.floor(raw);
}

/** Drop events past the retention window. Returns how many rows were removed. */
export async function pruneActivityLog(): Promise<number> {
  const days = activityRetentionDays();
  if (days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60_000);
  const { count } = await prisma.activityEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}

/** Panel base URL used in webhook/email links. */
export function activityServerUrl(serverId: string | null): string | null {
  if (!serverId) return null;
  return `${config.publicBaseUrl.replace(/\/$/, "")}/servers/${serverId}`;
}
