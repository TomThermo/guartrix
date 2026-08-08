import { z } from "zod";
import { BACKUP_UPLOAD_MAX_BYTES } from "@msm/shared";

export const scheduleSchema = z.object({
  mode: z.enum(["off", "interval", "daily", "cron"]),
  intervalHours: z.number().int().min(1).max(168).optional(),
  dailyAt: z.string().optional(),
  cronExpression: z.string().max(120).optional(),
  keepCount: z.number().int().min(1).max(50).optional(),
});

export const initSchema = z.object({
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(BACKUP_UPLOAD_MAX_BYTES),
  note: z.string().max(120).optional(),
});

export function parseRange(
  rangeHeader: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) return null;
  let start = m[1] === "" ? NaN : Number(m[1]);
  let end = m[2] === "" ? NaN : Number(m[2]);
  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    const suffix = end;
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

export function isChunkUpload(request: { method: string; url: string }): boolean {
  if (request.method !== "PUT") return false;
  const pathOnly = request.url.split("?")[0];
  return /\/api\/servers\/[^/]+\/backups\/upload\/[^/]+\/chunks\/\d+$/.test(pathOnly);
}
