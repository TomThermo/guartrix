import fs from "node:fs/promises";
import path from "node:path";
import { serverDir } from "./config.js";
import {
  ensureDefaultServerIcon,
  isCustomServerIcon,
  readDefaultServerIcon,
  serverIconFilePath,
} from "./default-icon.js";
import { fixDataOwnership } from "./process-manager.js";

export {
  ensureDefaultServerIcon,
  readDefaultServerIcon,
  serverIconFilePath as serverIconPath,
} from "./default-icon.js";

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_ICON_BYTES = 256 * 1024;

export function hasServerIcon(serverId: string): boolean {
  return isCustomServerIcon(serverId);
}

export function readPngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(PNG_SIG)) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

export function validateServerIconPng(buffer: Buffer): {
  ok: boolean;
  width?: number;
  height?: number;
  error?: string;
} {
  if (buffer.length === 0) return { ok: false, error: "Empty file" };
  if (buffer.length > MAX_ICON_BYTES) {
    return { ok: false, error: "Icon too large (max 256 KB)" };
  }
  const size = readPngSize(buffer);
  if (!size) {
    return { ok: false, error: "File must be a PNG image" };
  }
  if (size.width !== 64 || size.height !== 64) {
    return {
      ok: false,
      width: size.width,
      height: size.height,
      error: `Minecraft requires exactly 64×64 PNG (got ${size.width}×${size.height})`,
    };
  }
  return { ok: true, width: 64, height: 64 };
}

export async function saveServerIcon(
  serverId: string,
  buffer: Buffer,
): Promise<{ width: number; height: number }> {
  await fixDataOwnership(serverDir(serverId));
  const check = validateServerIconPng(buffer);
  if (!check.ok) throw new Error(check.error ?? "Invalid icon");
  const dest = serverIconFilePath(serverId);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, buffer);
  return { width: check.width!, height: check.height! };
}

export async function deleteServerIcon(serverId: string): Promise<void> {
  await fixDataOwnership(serverDir(serverId));
  await fs.rm(serverIconFilePath(serverId), { force: true });
  // Restore the default pack icon so Minecraft still has something to show
  ensureDefaultServerIcon(serverId);
}

/**
 * Custom icon if present and non-empty, otherwise the Guartrix default pack icon.
 */
export async function readServerIcon(serverId: string): Promise<Buffer> {
  try {
    const buf = await fs.readFile(serverIconFilePath(serverId));
    if (buf.length > 0) return buf;
  } catch {
    // missing
  }
  return readDefaultServerIcon();
}
