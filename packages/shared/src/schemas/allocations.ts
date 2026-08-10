import { z } from "zod";

export const allocationProtocolSchema = z.enum(["tcp", "udp"]);

export const allocationCreateRangeSchema = z.object({
  portStart: z.number().int().min(1024).max(65535),
  portEnd: z.number().int().min(1024).max(65535).optional(),
  protocol: allocationProtocolSchema.optional().default("tcp"),
  ip: z.string().min(1).max(64).optional(),
  notes: z.string().max(255).optional(),
});

export const allocationAssignSchema = z
  .object({
    allocationId: z.string().min(1).max(64).optional(),
    port: z.number().int().min(1024).max(65535).optional(),
    protocol: allocationProtocolSchema.optional().default("tcp"),
    notes: z.string().max(255).optional(),
    /** Also assign/create UDP on the same port (query / Geyser). */
    alsoUdp: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.allocationId || v.port), {
    message: "allocationId or port is required",
  });

export const allocationPatchSchema = z.object({
  notes: z.string().max(255).nullable().optional(),
  isPrimary: z.boolean().optional(),
  alsoUdp: z.boolean().optional(),
});

/** Legacy aliases for route imports */
export const protocolSchema = allocationProtocolSchema;
export const createRangeSchema = allocationCreateRangeSchema;
export const assignSchema = allocationAssignSchema;
export const patchSchema = allocationPatchSchema;
