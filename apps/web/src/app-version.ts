/** Product version baked in at Vite build time (from root VERSION / package.json). */
export function getAppVersion(): string {
  const raw = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim();
  return raw || "0.0.0";
}

/** Display form for footers, e.g. `v1.2.2`. */
export function getAppVersionLabel(): string {
  const v = getAppVersion();
  return v.startsWith("v") ? v : `v${v}`;
}
