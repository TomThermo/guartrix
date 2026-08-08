/**
 * Outbound URL safety for webhooks and package downloads.
 * Blocks non-HTTPS (optional), private/link-local/metadata targets, and
 * optionally requires an allowlisted hostname.
 * Fetches pin DNS to the pre-validated address (anti rebinding TOCTOU).
 */
export { isBlockedIp } from "./safe-url/ip.js";
export type { SafeUrlOptions, ResolvedSafeUrl } from "./safe-url/resolve.js";
export {
  assertSafeOutboundUrl,
  resolveSafeOutboundUrl,
  DISCORD_WEBHOOK_HOST_SUFFIXES,
  assertSafeWebhookUrl,
  resolveSafeWebhookUrl,
  DOWNLOAD_HOST_SUFFIXES,
  assertSafeDownloadUrl,
  resolveSafeDownloadUrl,
  assertSafeBrowserUrl,
} from "./safe-url/resolve.js";
export {
  fetchPinned,
  fetchSafeDownload,
  fetchSafeWebhook,
  fetchSafeOutbound,
} from "./safe-url/fetch.js";
