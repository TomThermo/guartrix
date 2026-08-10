/**
 * Shared HTTP(S) URL allowlist helpers for rendered markdown / external links.
 * Policy lives in @guartrix/shared (same host rules as the API SSRF guards).
 */
export { safeHttpUrl, safeExternalUrl, parseSafeHttpUrl } from "@guartrix/shared";
