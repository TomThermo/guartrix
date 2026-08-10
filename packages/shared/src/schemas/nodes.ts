import { z } from "zod";
import { SERVER_TYPES } from "./servers.js";

export const locationSchema = z
  .union([z.string().max(64), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return v;
    const t = v.trim();
    return t.length > 0 ? t : null;
  });

export const nodeCreateSchema = z.object({
  name: z.string().min(1).max(64),
  fqdn: z.string().min(1).max(255),
  scheme: z.enum(["http", "https"]).optional().default("http"),
  daemonPort: z.number().int().min(1).max(65535).optional().default(8081),
  behindProxy: z.boolean().optional().default(false),
  memoryMb: z.number().int().min(0).optional().default(0),
  location: locationSchema,
});

const percentSchema = z.number().int().min(0).max(1000);
const miBSchema = z.number().int().min(0).max(100_000_000);

export const nodeUpdateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  fqdn: z.string().min(1).max(255).optional(),
  scheme: z.enum(["http", "https"]).optional(),
  daemonPort: z.number().int().min(1).max(65535).optional(),
  behindProxy: z.boolean().optional(),
  memoryMb: miBSchema.optional(),
  memoryOverallocate: percentSchema.optional(),
  diskMb: miBSchema.optional(),
  diskOverallocate: percentSchema.optional(),
  cpuLimit: z.number().int().min(0).max(100_000).optional(),
  cpuOverallocate: percentSchema.optional(),
  uploadLimitMb: z.number().int().min(1).max(20_480).optional(),
  daemonBaseDirectory: z.string().min(1).max(255).optional(),
  sftpPort: z.number().int().min(1).max(65535).optional(),
  sftpAlias: z
    .union([z.string().max(255), z.null()])
    .optional()
    .transform((v) => {
      if (v == null) return v;
      const t = v.trim();
      return t.length > 0 ? t : null;
    }),
  tags: z.array(z.string().min(1).max(32)).max(32).optional(),
  deployable: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  location: locationSchema,
});

export const nodeServerTypeSchema = z.enum(SERVER_TYPES);

/** @deprecated use nodeServerTypeSchema */
export const serverTypeSchema = nodeServerTypeSchema;

/** Legacy aliases for route imports */
export const createSchema = nodeCreateSchema;
export const updateSchema = nodeUpdateSchema;
