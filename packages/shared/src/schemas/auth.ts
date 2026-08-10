import { z } from "zod";

export const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const userRoleSchema = z.enum(["ADMIN", "OPERATOR", "VIEWER"]);

export const quotaLimitSchema = z.number().int().min(0).max(10_000).nullable().optional();

/** Wider cap for Application API body fields. */
export const applicationQuotaLimitSchema = z.number().int().min(0).max(100_000).nullable();
