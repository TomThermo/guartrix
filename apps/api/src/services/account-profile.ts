import { randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  buildPhoneE164,
  findCountryDial,
  type AccountProfile,
  type AddressSuggestItem,
  type AuthUser,
} from "@guartrix/shared";
import {
  profilePatchSchema,
  type ProfilePatchInput,
} from "@guartrix/shared/schemas/account";
import { logActivity } from "../activity-log.js";
import {
  findUserByEmailInsensitive,
  hashPassword,
  hashResetToken,
  panelBaseUrl,
  passwordSchema,
  verifyAccountPassword,
} from "../auth/auth.js";
import { verifyTotp } from "../auth/totp.js";
import { prisma } from "../db.js";
import { sendMail } from "../mail.js";
import { ServiceError } from "./errors.js";

export { profilePatchSchema, type ProfilePatchInput };

export const changePasswordSchema = z
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

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

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

export async function getAccountProfile(userId: string): Promise<{ profile: AccountProfile }> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: profileSelect,
  });
  if (!row) throw new ServiceError(404, "User not found");
  return { profile: toProfile(row) };
}

export async function updateAccountProfile(opts: {
  user: AuthUser;
  body: ProfilePatchInput;
  request: FastifyRequest;
}): Promise<{ profile: AccountProfile; emailVerificationSent: boolean }> {
  const { user, body, request } = opts;
  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { ...profileSelect, id: true },
  });
  if (!current) throw new ServiceError(404, "User not found");

  const data: Record<string, unknown> = {};
  let emailChanged = false;
  let nextEmail: string | null | undefined;

  if (body.email !== undefined) {
    nextEmail = emptyToNull(body.email);
    if (nextEmail) {
      const taken = await findUserByEmailInsensitive(nextEmail);
      if (taken && taken.id !== user.id) {
        throw new ServiceError(409, "Email already registered", { code: "EMAIL_TAKEN" });
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
      throw new ServiceError(400, "Unsupported phone country");
    }
    const nationalDigits = (phoneNational ?? "").replace(/\D/g, "");
    if (phoneCountry && !nationalDigits) {
      throw new ServiceError(400, "Enter a mobile number");
    }
    if (nationalDigits && !phoneCountry) {
      throw new ServiceError(400, "Select a country code for your phone");
    }
    if (phoneCountry && nationalDigits) {
      const e164 = buildPhoneE164(phoneCountry, nationalDigits);
      if (!e164) throw new ServiceError(400, "Invalid mobile number");
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
      throw new ServiceError(400, "Invalid address country");
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
}

export async function suggestAddresses(opts: {
  q: string;
  country: string;
}): Promise<{ suggestions: AddressSuggestItem[] }> {
  const q = opts.q.trim();
  const country = opts.country.trim().toUpperCase();
  if (q.length < 3) return { suggestions: [] };

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
    throw new ServiceError(502, "Address lookup temporarily unavailable");
  }

  const suggestions = hits.map(mapNominatim).filter((x): x is AddressSuggestItem => Boolean(x));
  return { suggestions };
}

export async function checkEmailAvailable(
  userId: string,
  emailRaw: string,
): Promise<{ available: boolean; own: boolean; valid: boolean; code?: string }> {
  const raw = emailRaw.trim().toLowerCase();
  if (!raw) return { available: true, own: false, valid: false };
  const valid = z.string().email().max(254).safeParse(raw).success;
  if (!valid) return { available: false, own: false, valid: false };

  const taken = await findUserByEmailInsensitive(raw);
  if (!taken) return { available: true, own: false, valid: true };
  if (taken.id === userId) return { available: true, own: true, valid: true };
  return { available: false, own: false, valid: true, code: "EMAIL_TAKEN" };
}

export async function changeAccountPassword(opts: {
  user: AuthUser;
  body: ChangePasswordInput;
  request: FastifyRequest;
}): Promise<{ ok: true }> {
  const { user, body, request } = opts;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, totpEnabled: true, totpSecret: true },
  });
  if (!row) throw new ServiceError(404, "User not found");

  if (!(await verifyAccountPassword(request, body.currentPassword))) {
    throw new ServiceError(401, "Invalid current password", { code: "BAD_PASSWORD" });
  }

  if (row.totpEnabled) {
    const code = body.totpCode?.trim() ?? "";
    if (!code) {
      throw new ServiceError(400, "Authenticator code is required", { code: "TOTP_REQUIRED" });
    }
    if (!row.totpSecret || !verifyTotp(row.totpSecret, code)) {
      throw new ServiceError(401, "Invalid authenticator code", { code: "BAD_TOTP" });
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(body.newPassword) },
  });

  await logActivity({
    action: "account.password.change",
    request,
    user: { id: user.id, username: user.username },
    success: true,
  });

  return { ok: true };
}
