import { z } from "zod";
import { SERVER_PERMISSIONS } from "../permissions.js";

const iso2 = z
  .string()
  .trim()
  .length(2)
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z]{2}$/.test(v), { message: "Invalid country code" });

const optionalIso2 = z.union([iso2, z.literal(""), z.null()]).optional();

export const profilePatchSchema = z.object({
  email: z.union([z.string().trim().email().max(254), z.literal(""), z.null()]).optional(),
  displayName: z.union([z.string().trim().max(120), z.literal(""), z.null()]).optional(),
  phoneCountry: optionalIso2,
  phoneNational: z.union([z.string().trim().max(32), z.literal(""), z.null()]).optional(),
  addressLine1: z.union([z.string().trim().max(191), z.literal(""), z.null()]).optional(),
  addressLine2: z.union([z.string().trim().max(191), z.literal(""), z.null()]).optional(),
  addressCity: z.union([z.string().trim().max(120), z.literal(""), z.null()]).optional(),
  addressPostalCode: z.union([z.string().trim().max(32), z.literal(""), z.null()]).optional(),
  addressCountry: optionalIso2,
  addressLat: z.union([z.number().min(-90).max(90), z.null()]).optional(),
  addressLon: z.union([z.number().min(-180).max(180), z.null()]).optional(),
  clearAddressVerification: z.boolean().optional(),
});

export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;

const permsSchema = z
  .array(z.string())
  .max(SERVER_PERMISSIONS.length)
  .transform((arr) =>
    arr.filter((p): p is (typeof SERVER_PERMISSIONS)[number] =>
      (SERVER_PERMISSIONS as readonly string[]).includes(p),
    ),
  );

export const createSubUserSchema = z.object({
  email: z.string().email().max(255),
  permissions: permsSchema,
});

export const updateSubUserSchema = z.object({
  permissions: permsSchema,
});

export type CreateSubUserInput = z.infer<typeof createSubUserSchema>;
export type UpdateSubUserInput = z.infer<typeof updateSubUserSchema>;
