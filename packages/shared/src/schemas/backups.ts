import { z } from "zod";
import { BACKUP_UPLOAD_MAX_BYTES } from "../types/backups-files.js";

export const backupScheduleSchema = z.object({
  mode: z.enum(["off", "interval", "daily", "cron"]),
  intervalHours: z.number().int().min(1).max(168).optional(),
  dailyAt: z.string().optional(),
  cronExpression: z.string().max(120).optional(),
  keepCount: z.number().int().min(1).max(50).optional(),
});

export const backupUploadInitSchema = z.object({
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(BACKUP_UPLOAD_MAX_BYTES),
  note: z.string().max(120).optional(),
});

/** Legacy aliases for route imports */
export const scheduleSchema = backupScheduleSchema;
export const initSchema = backupUploadInitSchema;
