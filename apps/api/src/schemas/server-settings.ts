import { z } from "zod";

export const serverSettingsUpdateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  memoryMb: z.number().int().min(512).max(65536).optional(),
  diskMb: z.number().int().min(256).max(10_485_760).optional(),
  cpuLimit: z.number().int().min(0).max(10_000).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  javaVersion: z.enum(["8", "11", "17", "21", "25"]).nullable().optional(),
  startupCommand: z.string().max(4000).nullable().optional(),
  serverJar: z.string().min(1).max(128).nullable().optional(),
  properties: z.record(z.string()).optional(),
  autoRestart: z.boolean().optional(),
  startOnBoot: z.boolean().optional(),
  ownerAlertWebhookUrl: z.union([z.string().url().max(500), z.literal(""), z.null()]).optional(),
  ownerAlertEmail: z.union([z.string().email().max(255), z.literal(""), z.null()]).optional(),
  discordStatusWebhookUrl: z.union([z.string().url().max(500), z.literal(""), z.null()]).optional(),
  discordStatusEnabled: z.boolean().optional(),
  bluemapUrl: z.union([z.string().url().max(500), z.literal(""), z.null()]).optional(),
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
  ownerId: z.string().nullable().optional(),
  suspended: z.boolean().optional(),
});

export type ServerSettingsPatch = z.infer<typeof serverSettingsUpdateSchema>;
