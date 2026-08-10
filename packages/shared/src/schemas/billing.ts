import { z } from "zod";
import { SERVER_TYPES } from "./servers.js";

export const planBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase-kebab"),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).nullable().optional(),
  priceCents: z.number().int().min(0).max(10_000_000),
  currency: z.string().trim().min(3).max(3).default("EUR"),
  maxServers: z.number().int().min(0).max(10_000),
  maxMemoryMb: z.number().int().min(0).max(10_485_760),
  maxDatabases: z.number().int().min(0).max(10_000),
  defaultMemoryMb: z.number().int().min(512).max(65536).optional(),
  defaultDiskMb: z.number().int().min(1024).max(10_485_760).optional(),
  autoCreateServer: z.boolean().optional(),
  defaultServerType: z.enum(SERVER_TYPES).optional(),
  defaultMcVersion: z.string().trim().min(1).max(32).optional(),
  recurringInterval: z
    .string()
    .trim()
    .regex(/^\d+\s+(days?|weeks?|months?|years?)$/i)
    .nullable()
    .optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export type PlanBodyInput = z.infer<typeof planBodySchema>;
