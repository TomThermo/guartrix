import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverDir } from "./config.js";

const ICON_NAME = "default-server-icon.png";

let cachedDefaultIconPath: string | null = null;
let cachedDefaultIcon: Buffer | null = null;

/** Resolve bundled default pack icon (release tree + dev monorepo). */
export function resolveDefaultServerIconPath(): string {
  if (cachedDefaultIconPath) return cachedDefaultIconPath;

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // esbuild bundle: apps/api/dist/index.js → apps/api/assets/
    path.join(moduleDir, "../assets", ICON_NAME),
    // Same-dir assets (if copied beside dist)
    path.join(moduleDir, "assets", ICON_NAME),
    // node-agent package (tsc / tsx)
    path.join(moduleDir, "../assets", ICON_NAME),
    // Dev / monorepo from repo or build root
    path.join(process.cwd(), "packages/node-agent/assets", ICON_NAME),
    path.join(process.cwd(), "apps/api/assets", ICON_NAME),
  ];

  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        cachedDefaultIconPath = p;
        return p;
      }
    } catch {
      // ignore
    }
  }

  throw new Error(
    `Default server icon not found (${ICON_NAME}). Rebuild the panel or ensure packages/node-agent/assets is staged.`,
  );
}

/** @deprecated Prefer resolveDefaultServerIconPath() — lazy at first read. */
export function getDefaultServerIconPath(): string {
  return resolveDefaultServerIconPath();
}

export function readDefaultServerIcon(): Buffer {
  if (cachedDefaultIcon) return cachedDefaultIcon;
  cachedDefaultIcon = readFileSync(resolveDefaultServerIconPath());
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
