/**
 * Thin re-export barrel — kept so existing `./license.js` imports keep working
 * after the split into `license-validate.ts` (validate/watcher) and
 * `license-quota.ts` (free-tier + assert quota helpers).
 */
export * from "./license-validate.js";
export * from "./license-quota.js";
