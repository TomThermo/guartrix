import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverDir } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SERVER_ICON_PATH = path.join(
  __dirname,
  "../assets/default-server-icon.png",
);

let cachedDefaultIcon: Buffer | null = null;

export function readDefaultServerIcon(): Buffer {
  if (cachedDefaultIcon) return cachedDefaultIcon;
  cachedDefaultIcon = readFileSync(DEFAULT_SERVER_ICON_PATH);
  return cachedDefaultIcon;
}

export function serverIconFilePath(serverId: string): string {
  return path.join(serverDir(serverId), "server-icon.png");
}

/** Write the default pack icon when missing or empty (Minecraft multiplayer list). */
export function ensureDefaultServerIcon(serverId: string): void {
  const dest = serverIconFilePath(serverId);
  try {
    if (existsSync(dest) && statSync(dest).size > 0) return;
  } catch {
    // write below
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, readDefaultServerIcon());
}

export function isCustomServerIcon(serverId: string): boolean {
  const p = serverIconFilePath(serverId);
  try {
    const st = statSync(p);
    if (!st.isFile() || st.size <= 0) return false;
    const def = readDefaultServerIcon();
    // Cheap path: different size ⇒ custom (skip full read).
    if (st.size !== def.length) return true;
    const buf = readFileSync(p);
    return !(buf.length === def.length && buf.equals(def));
  } catch {
    return false;
  }
}
