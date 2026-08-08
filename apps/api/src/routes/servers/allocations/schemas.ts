import { z } from "zod";

export const protocolSchema = z.enum(["tcp", "udp"]);

export const createRangeSchema = z.object({
  portStart: z.number().int().min(1024).max(65535),
  portEnd: z.number().int().min(1024).max(65535).optional(),
  protocol: protocolSchema.optional().default("tcp"),
  ip: z.string().min(1).max(64).optional(),
  notes: z.string().max(255).optional(),
});

export const assignSchema = z
  .object({
    allocationId: z.string().min(1).max(64).optional(),
    port: z.number().int().min(1024).max(65535).optional(),
    protocol: protocolSchema.optional().default("tcp"),
    notes: z.string().max(255).optional(),
    /** Also assign/create UDP on the same port (query / Geyser). */
    alsoUdp: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.allocationId || v.port), {
    message: "allocationId or port is required",
  });

export const patchSchema = z.object({
  notes: z.string().max(255).nullable().optional(),
  isPrimary: z.boolean().optional(),
  alsoUdp: z.boolean().optional(),
});
