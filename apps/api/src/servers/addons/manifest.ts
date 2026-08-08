import fs from "node:fs/promises";
import path from "node:path";
import type { ServerType } from "@msm/shared";
import { addonKindFor } from "@msm/shared";
import type { AddonKind, Manifest } from "./types.js";

export function kindFor(type: ServerType): AddonKind | null {
  return addonKindFor(type);
}

export function addonDir(serverDir: string, type: ServerType): string | null {
  if (type === "PAPER" || type === "PURPUR") return path.join(serverDir, "plugins");
  if (type === "FABRIC" || type === "QUILT" || type === "FORGE" || type === "NEOFORGE") {
    return path.join(serverDir, "mods");
  }
  return null;
}

function manifestPath(serverDir: string): string {
  return path.join(serverDir, "guartrix-addons.json");
}

export async function readManifest(serverDir: string): Promise<Manifest> {
  try {
    const raw = await fs.readFile(manifestPath(serverDir), "utf8");
    const data = JSON.parse(raw) as Manifest;
    return { addons: Array.isArray(data.addons) ? data.addons : [] };
  } catch {
    return { addons: [] };
  }
}

export async function writeManifest(serverDir: string, manifest: Manifest): Promise<void> {
  await fs.writeFile(manifestPath(serverDir), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
