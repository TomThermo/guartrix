import { z } from "zod";

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

export const createSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(SERVER_TYPES),
  mcVersion: z.string().min(1),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  nodeId: z.string().min(1).optional(),
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

export const cloneSchema = z.object({
  name: z.string().min(1).max(64),
  port: z.number().int().min(1024).max(65535),
  memoryMb: z.number().int().min(512).max(65536).optional(),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  nodeId: z.string().min(1).optional(),
});
