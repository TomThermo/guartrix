import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  buildPhoneE164,
  findCountryDial,
  type AccountProfile,
  type AddressSuggestItem,
} from "@msm/shared";
import { logActivity } from "../../activity-log.js";
import {
  findUserByEmailInsensitive,
  hashPassword,
  hashResetToken,
  panelBaseUrl,
  passwordSchema,
  requireSessionAuth,
  verifyAccountPassword,
} from "../../auth/auth.js";
import { assertSameOrigin } from "../../auth/csrf.js";
import { verifyTotp } from "../../auth/totp.js";
import { prisma } from "../../db.js";
import { sendMail } from "../../mail.js";

const iso2 = z
  .string()
  .trim()
  .length(2)
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z]{2}$/.test(v), { message: "Invalid country code" });

const optionalIso2 = z.union([iso2, z.literal(""), z.null()]).optional();

const profilePatchSchema = z.object({
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

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1),
    totpCode: z.string().trim().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.newPassword !== val.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New passwords do not match",
        path: ["confirmPassword"],
      });
    }
    if (val.currentPassword === val.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "New password must be different from the current password",
        path: ["newPassword"],
      });
    }
  });

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length ? t : null;
}

function toProfile(row: {
  username: string;
  email: string | null;
  emailVerified: boolean;
  totpEnabled: boolean;
  displayName: string | null;
  phoneCountry: string | null;
  phoneNational: string | null;
  phoneE164: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  addressLat: number | null;
  addressLon: number | null;
  addressVerifiedAt: Date | null;
}): AccountProfile {
  return {
    username: row.username,
    email: row.email,
    emailVerified: row.emailVerified,
    twoFactorEnabled: Boolean(row.totpEnabled),
    displayName: row.displayName,
    phoneCountry: row.phoneCountry,
    phoneNational: row.phoneNational,
    phoneE164: row.phoneE164,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    addressCity: row.addressCity,
    addressPostalCode: row.addressPostalCode,
    addressCountry: row.addressCountry,
    addressLat: row.addressLat,
    addressLon: row.addressLon,
    addressVerifiedAt: row.addressVerifiedAt?.toISOString() ?? null,
  };
}

const profileSelect = {
  username: true,
  email: true,
  emailVerified: true,
  totpEnabled: true,
  displayName: true,
  phoneCountry: true,
  phoneNational: true,
  phoneE164: true,
  addressLine1: true,
  addressLine2: true,
  addressCity: true,
  addressPostalCode: true,
  addressCountry: true,
  addressLat: true,
  addressLon: true,
  addressVerifiedAt: true,
} as const;

type NominatimHit = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    road?: string;
    house_number?: string;
    pedestrian?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    postcode?: string;
    country_code?: string;
  };
};

function mapNominatim(hit: NominatimHit): AddressSuggestItem | null {
  const addr = hit.address ?? {};
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const street = [addr.road || addr.pedestrian, addr.house_number].filter(Boolean).join(" ").trim();
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || "";
  const country = (addr.country_code || "").toUpperCase();
  if (!street && !city) return null;
  return {
    label: hit.display_name || [street, city, addr.postcode].filter(Boolean).join(", "),
    addressLine1: street || city,
    addressLine2: null,
    addressCity: city,
    addressPostalCode: addr.postcode || "",
    addressCountry: /^[A-Z]{2}$/.test(country) ? country : "",
    lat,
    lon,
  };
}

export function registerAccountProfileRoutes(app: FastifyInstance): void {
  app.get("/api/account/profile", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: profileSelect,
    });
    if (!row) return reply.status(404).send({ error: "User not found" });
    return { profile: toProfile(row) };
  });

  app.patch("/api/account/profile", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const parsed = profilePatchSchema.safeParse(request.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const first =
        Object.values(flat.fieldErrors).flat()[0] || flat.formErrors[0] || "Invalid profile data";
      return reply.status(400).send({ error: first });
    }

    const body = parsed.data;
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { ...profileSelect, id: true },
    });
    if (!current) return reply.status(404).send({ error: "User not found" });

    const data: Record<string, unknown> = {};
    let emailChanged = false;
    let nextEmail: string | null | undefined;

    if (body.email !== undefined) {
      nextEmail = emptyToNull(body.email);
      if (nextEmail) {
        const taken = await findUserByEmailInsensitive(nextEmail);
        if (taken && taken.id !== user.id) {
          return reply.status(409).send({
            error: "Email already registered",
            code: "EMAIL_TAKEN",
          });
        }
      }
      const prev = (current.email ?? "").toLowerCase();
      const next = (nextEmail ?? "").toLowerCase();
      if (prev !== next) {
        emailChanged = true;
        data.email = nextEmail;
        data.emailVerified = nextEmail ? false : false;
      }
    }

    if (body.displayName !== undefined) data.displayName = emptyToNull(body.displayName);

    const phoneCountry =
      body.phoneCountry !== undefined
        ? emptyToNull(body.phoneCountry)?.toUpperCase() ?? null
        : current.phoneCountry;
    const phoneNational =
      body.phoneNational !== undefined
        ? emptyToNull(body.phoneNational)?.replace(/[^\d\s+-]/g, "") ?? null
        : current.phoneNational;

    if (body.phoneCountry !== undefined || body.phoneNational !== undefined) {
      if (phoneCountry && !findCountryDial(phoneCountry)) {
        return reply.status(400).send({ error: "Unsupported phone country" });
      }
      const nationalDigits = (phoneNational ?? "").replace(/\D/g, "");
      if (phoneCountry && !nationalDigits) {
        return reply.status(400).send({ error: "Enter a mobile number" });
      }
      if (nationalDigits && !phoneCountry) {
        return reply.status(400).send({ error: "Select a country code for your phone" });
      }
      if (phoneCountry && nationalDigits) {
        const e164 = buildPhoneE164(phoneCountry, nationalDigits);
        if (!e164) return reply.status(400).send({ error: "Invalid mobile number" });
        data.phoneCountry = phoneCountry;
        data.phoneNational = nationalDigits;
        data.phoneE164 = e164;
      } else {
        data.phoneCountry = null;
        data.phoneNational = null;
        data.phoneE164 = null;
      }
    }

    const addressFields = [
      "addressLine1",
      "addressLine2",
      "addressCity",
      "addressPostalCode",
      "addressCountry",
    ] as const;
    let addressTouched = false;
    for (const key of addressFields) {
      if (body[key] !== undefined) {
        addressTouched = true;
        const raw = body[key];
        data[key] =
          key === "addressCountry"
            ? emptyToNull(raw as string | null)?.toUpperCase() ?? null
            : emptyToNull(raw as string | null);
      }
    }

    if (body.addressCountry !== undefined && data.addressCountry) {
      const code = String(data.addressCountry);
      if (!findCountryDial(code) && !/^[A-Z]{2}$/.test(code)) {
        return reply.status(400).send({ error: "Invalid address country" });
      }
    }

    if (body.addressLat !== undefined) data.addressLat = body.addressLat;
    if (body.addressLon !== undefined) data.addressLon = body.addressLon;

    if (
      body.addressLat != null &&
      body.addressLon != null &&
      Number.isFinite(body.addressLat) &&
      Number.isFinite(body.addressLon)
    ) {
      data.addressVerifiedAt = new Date();
    } else if (body.clearAddressVerification || addressTouched) {
      if (body.addressLat === undefined && body.addressLon === undefined) {
        data.addressLat = null;
        data.addressLon = null;
        data.addressVerifiedAt = null;
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: profileSelect,
    });

    if (emailChanged && nextEmail) {
      await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      const rawToken = randomBytes(32).toString("hex");
      await prisma.emailVerificationToken.create({
        data: {
          id: nanoid(12),
          userId: user.id,
          tokenHash: hashResetToken(rawToken),
          expiresAt: new Date(Date.now() + 48 * 60 * 60_000),
        },
      });
      const verifyUrl = `${panelBaseUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
      await sendMail({
        to: nextEmail,
        subject: "Verify your Guartrix email",
        text: [
          `Hi ${updated.username},`,
          "",
          "Confirm your new email address for Guartrix:",
          verifyUrl,
          "",
          "This link expires in 48 hours.",
        ].join("\n"),
      });
    }

    await logActivity({
      action: "account.profile.update",
      request,
      user: { id: user.id, username: user.username },
      success: true,
      metadata: {
        emailChanged,
        phoneUpdated: body.phoneCountry !== undefined || body.phoneNational !== undefined,
        addressUpdated: addressTouched,
      },
    });

    return {
      profile: toProfile(updated),
      emailVerificationSent: Boolean(emailChanged && nextEmail),
    };
  });

  /** Address autocomplete / check via OpenStreetMap Nominatim (server-side). */
  app.get("/api/account/address-suggest", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const q = String((request.query as { q?: string }).q ?? "").trim();
    const country = String((request.query as { country?: string }).country ?? "")
      .trim()
      .toUpperCase();
    if (q.length < 3) return { suggestions: [] as AddressSuggestItem[] };

    const params = new URLSearchParams({
      q,
      format: "json",
      addressdetails: "1",
      limit: "6",
    });
    if (/^[A-Z]{2}$/.test(country)) params.set("countrycodes", country.toLowerCase());

    let hits: NominatimHit[] = [];
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "GuartrixPanel/1.0 (account address check; https://guartrix.com)",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        hits = (await res.json()) as NominatimHit[];
      }
    } catch {
      return reply.status(502).send({ error: "Address lookup temporarily unavailable" });
    }

    const suggestions = hits
      .map(mapNominatim)
      .filter((x): x is AddressSuggestItem => Boolean(x));

    return { suggestions };
  });

  /** Live check whether an email can be claimed by this account. */
  app.get("/api/account/email-available", async (request, reply) => {
    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const raw = String((request.query as { email?: string }).email ?? "").trim().toLowerCase();
    if (!raw) return { available: true, own: false, valid: false };
    const valid = z.string().email().max(254).safeParse(raw).success;
    if (!valid) return { available: false, own: false, valid: false };

    const taken = await findUserByEmailInsensitive(raw);
    if (!taken) return { available: true, own: false, valid: true };
    if (taken.id === user.id) return { available: true, own: true, valid: true };
    return { available: false, own: false, valid: true, code: "EMAIL_TAKEN" };
  });

  app.post("/api/account/password", async (request, reply) => {
    const originErr = assertSameOrigin(request);
    if (originErr) return reply.status(403).send({ error: originErr });

    const user = await requireSessionAuth(request, reply);
    if (!user) return;

    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const first =
        flat.fieldErrors.confirmPassword?.[0] ||
        flat.fieldErrors.newPassword?.[0] ||
        flat.fieldErrors.currentPassword?.[0] ||
        flat.formErrors[0] ||
        "Invalid password data";
      return reply.status(400).send({ error: first });
    }

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, totpEnabled: true, totpSecret: true },
    });
    if (!row) return reply.status(404).send({ error: "User not found" });

    if (!(await verifyAccountPassword(request, parsed.data.currentPassword))) {
      return reply.status(401).send({ error: "Invalid current password", code: "BAD_PASSWORD" });
    }

    if (row.totpEnabled) {
      const code = parsed.data.totpCode?.trim() ?? "";
      if (!code) {
        return reply.status(400).send({
          error: "Authenticator code is required",
          code: "TOTP_REQUIRED",
        });
      }
      if (!row.totpSecret || !verifyTotp(row.totpSecret, code)) {
        return reply.status(401).send({ error: "Invalid authenticator code", code: "BAD_TOTP" });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(parsed.data.newPassword) },
    });

    await logActivity({
      action: "account.password.change",
      request,
      user: { id: user.id, username: user.username },
      success: true,
    });

    return { ok: true };
  });
}
