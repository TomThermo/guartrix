/** ISO country + dialling metadata for phone / address UI. */

export type CountryDial = {
  /** ISO 3166-1 alpha-2 */
  code: string;
  name: string;
  /** International dialling prefix digits without + */
  dial: string;
};

/** Flag emoji from ISO2 (regional indicator symbols). */
export function countryFlagEmoji(iso2: string): string {
  const code = iso2.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}

export const COUNTRY_DIALS: readonly CountryDial[] = [
  { code: "NL", name: "Netherlands", dial: "31" },
  { code: "BE", name: "Belgium", dial: "32" },
  { code: "DE", name: "Germany", dial: "49" },
  { code: "FR", name: "France", dial: "33" },
  { code: "GB", name: "United Kingdom", dial: "44" },
  { code: "IE", name: "Ireland", dial: "353" },
  { code: "LU", name: "Luxembourg", dial: "352" },
  { code: "AT", name: "Austria", dial: "43" },
  { code: "CH", name: "Switzerland", dial: "41" },
  { code: "ES", name: "Spain", dial: "34" },
  { code: "PT", name: "Portugal", dial: "351" },
  { code: "IT", name: "Italy", dial: "39" },
  { code: "PL", name: "Poland", dial: "48" },
  { code: "CZ", name: "Czechia", dial: "420" },
  { code: "SK", name: "Slovakia", dial: "421" },
  { code: "HU", name: "Hungary", dial: "36" },
  { code: "RO", name: "Romania", dial: "40" },
  { code: "BG", name: "Bulgaria", dial: "359" },
  { code: "HR", name: "Croatia", dial: "385" },
  { code: "SI", name: "Slovenia", dial: "386" },
  { code: "DK", name: "Denmark", dial: "45" },
  { code: "SE", name: "Sweden", dial: "46" },
  { code: "NO", name: "Norway", dial: "47" },
  { code: "FI", name: "Finland", dial: "358" },
  { code: "EE", name: "Estonia", dial: "372" },
  { code: "LV", name: "Latvia", dial: "371" },
  { code: "LT", name: "Lithuania", dial: "370" },
  { code: "US", name: "United States", dial: "1" },
  { code: "CA", name: "Canada", dial: "1" },
  { code: "AU", name: "Australia", dial: "61" },
  { code: "NZ", name: "New Zealand", dial: "64" },
  { code: "BR", name: "Brazil", dial: "55" },
  { code: "MX", name: "Mexico", dial: "52" },
  { code: "IN", name: "India", dial: "91" },
  { code: "JP", name: "Japan", dial: "81" },
  { code: "KR", name: "South Korea", dial: "82" },
  { code: "SG", name: "Singapore", dial: "65" },
  { code: "AE", name: "United Arab Emirates", dial: "971" },
  { code: "ZA", name: "South Africa", dial: "27" },
  { code: "TR", name: "Türkiye", dial: "90" },
] as const;

export function findCountryDial(iso2: string | null | undefined): CountryDial | undefined {
  if (!iso2) return undefined;
  const code = iso2.trim().toUpperCase();
  return COUNTRY_DIALS.find((c) => c.code === code);
}

/** Build E.164 from ISO country + national digits. Returns null if incomplete. */
export function buildPhoneE164(
  countryIso2: string | null | undefined,
  national: string | null | undefined,
): string | null {
  const country = findCountryDial(countryIso2);
  const digits = (national ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!country || !digits) return null;
  if (digits.length < 6 || digits.length > 15) return null;
  return `+${country.dial}${digits}`;
}
