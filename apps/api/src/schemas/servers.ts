import { z } from "zod";

/** Shared Minecraft server type enum (Client + Application). */
export const SERVER_TYPES = [
  "VANILLA",
  "PAPER",
  "FABRIC",
  "FORGE",
  "PURPUR",
  "NEOFORGE",
  "QUILT",
  "BEDROCK",
  "BEDROCK_PREVIEW",
  "POCKETMINE",
  "NUKKIT",
] as const;

export const powerSignalSchema = z.enum(["start", "stop", "restart", "kill"]);

export const filePathSchema = z.string().min(1).max(512);

export const fileWriteSchema = z.object({
  path: filePathSchema,
  content: z.string().max(2_000_000),
});

export const fileMkdirSchema = z.object({
  path: filePathSchema,
});

export const fileRenameSchema = z.object({
  from: filePathSchema,
  to: filePathSchema,
});

export const fileDeleteSchema = z.object({
  path: filePathSchema,
});

export const fileCompressSchema = z.object({
  paths: z.array(filePathSchema).min(1).max(100),
  destination: filePathSchema,
});

export const fileDownloadZipSchema = z.object({
  paths: z.array(filePathSchema).min(1).max(100),
});

export const fileDecompressSchema = z.object({
  path: filePathSchema,
  destination: filePathSchema.optional(),
});

/**
 * Shared create fields. Client and Application extend with their own bounds/fields
 * so Application disk/cpu policy stays stricter without duplicating the type enum.
 */
export const createServerBaseSchema = z.object({
  name: z.string().trim().min(1).max(64),
  type: z.enum(SERVER_TYPES),
  mcVersion: z.string().min(1),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536),
  nodeId: z.string().min(1).optional(),
});

/** Panel create body (optional world/mount fields; looser disk/cpu caps). */
export const createServerClientSchema = createServerBaseSchema.extend({
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  seed: z.string().max(128).optional(),
  gamemode: z.enum(["survival", "creative", "adventure", "spectator"]).optional(),
  difficulty: z.enum(["peaceful", "easy", "normal", "hard"]).optional(),
  worldPreset: z.enum(["DEFAULT", "FLAT", "VOID"]).optional(),
  keepCount: z.number().int().min(1).max(50).optional(),
  extraMounts: z
    .array(
      z.object({
        host: z.string().min(1).max(512),
        container: z.string().min(1).max(512),
        readOnly: z.boolean().optional(),
      }),
    )
    .max(8)
    .nullable()
    .optional(),
});

/** Application API create — requires ownerId; keeps stricter disk/cpu bounds. */
export const createServerApplicationSchema = createServerBaseSchema
  .extend({
    ownerId: z.string().min(1),
    mcVersion: z.string().min(1).max(32),
    diskMb: z.number().int().min(1024).max(10_485_760).optional(),
    cpuLimit: z.number().int().min(0).max(6400).optional(),
  });

export const cloneServerSchema = z.object({
  name: z.string().trim().min(1).max(64),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536).optional(),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  nodeId: z.string().min(1).optional(),
});
