import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { SETTINGS_FILE, type PanelSettingsStored } from "./types.js";

export function settingsPath(): string {
  return path.join(config.dataDir, SETTINGS_FILE);
}

export function envPath(): string {
  return path.join(config.rootDir, ".env");
}

export function readStoredSync(): PanelSettingsStored {
  const file = settingsPath();
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as PanelSettingsStored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    console.warn("[guartrix] Failed to read panel-settings.json — using env only");
    return {};
  }
}

export async function readStoredSettings(): Promise<PanelSettingsStored> {
  const file = settingsPath();
  try {
    const raw = await fsPromises.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as PanelSettingsStored;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    console.warn("[guartrix] Failed to read panel-settings.json:", err);
    return {};
  }
}

export async function writeStoredSettings(next: PanelSettingsStored): Promise<void> {
  await fsPromises.mkdir(config.dataDir, { recursive: true });
  const tmp = `${settingsPath()}.tmp`;
  await fsPromises.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  await fsPromises.rename(tmp, settingsPath());
}
