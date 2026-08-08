import fsPromises from "node:fs/promises";
import { envPath } from "./io.js";
import type { PanelSettingsPatch, PanelSettingsStored } from "./types.js";

export function setEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
  if (re.test(content)) {
    return content.replace(re, line);
  }
  const trimmed = content.endsWith("\n") ? content : `${content}\n`;
  return `${trimmed}\n# Synced from Admin → Settings\n${line}\n`;
}

/** Sync web/HTTPS keys into live `.env` so prod-web picks them up after restart. */
export async function syncEnvFromSettings(stored: PanelSettingsStored): Promise<string[]> {
  const changed: string[] = [];
  const file = envPath();
  let content: string;
  try {
    content = await fsPromises.readFile(file, "utf8");
  } catch {
    console.warn("[guartrix] .env missing — skip env sync for panel settings");
    return changed;
  }

  const updates: Array<[string, string | undefined]> = [
    ["PUBLIC_HOST", stored.publicHost],
    ["PUBLIC_BASE_URL", stored.publicBaseUrl],
    [
      "SESSION_SECURE",
      stored.sessionSecure === undefined ? undefined : stored.sessionSecure ? "true" : "false",
    ],
    [
      "HTTPS_ENABLED",
      stored.httpsEnabled === undefined ? undefined : stored.httpsEnabled ? "true" : "false",
    ],
    ["TRUST_PROXY", stored.trustProxy === undefined ? undefined : stored.trustProxy ? "1" : "0"],
    ["TRUSTED_PROXIES", stored.trustedProxies],
    ["APP_NAME", stored.appName],
  ];

  let next = content;
  for (const [key, value] of updates) {
    if (value === undefined) continue;
    const before = next;
    next = setEnvLine(next, key, value);
    if (next !== before) changed.push(key);
  }

  if (changed.length > 0) {
    const tmp = `${file}.tmp`;
    await fsPromises.writeFile(tmp, next, { mode: 0o600 });
    await fsPromises.rename(tmp, file);
  }
  return changed;
}

export function restartRequiredForPatch(patch: PanelSettingsPatch): boolean {
  return (
    patch.publicHost !== undefined ||
    patch.publicBaseUrl !== undefined ||
    patch.httpsEnabled !== undefined ||
    patch.sessionSecure !== undefined ||
    patch.trustProxy !== undefined ||
    patch.trustedProxies !== undefined
  );
}
