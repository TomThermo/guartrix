import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const CONTROL_FILE_RENAMES: Array<[string, string]> = [
  ["blockhost-addons.json", "guartrix-addons.json"],
  ["blockhost-resource-pack.json", "guartrix-resource-pack.json"],
  ["blockhost-resource-pack.zip", "guartrix-resource-pack.zip"],
  ["blockhost-scheduled-tasks.json", "guartrix-scheduled-tasks.json"],
  ["blockhost-player-history.json", "guartrix-player-history.json"],
  ["blockhost-console-history.json", "guartrix-console-history.json"],
];

/** Rename leftover BlockHost control files to Guartrix names (once). */
export async function migrateLegacyBrandFiles(): Promise<void> {
  const root = path.join(config.dataDir, "servers");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }

  for (const id of entries) {
    const dir = path.join(root, id);
    for (const [from, to] of CONTROL_FILE_RENAMES) {
      const src = path.join(dir, from);
      const dest = path.join(dir, to);
      try {
        await fs.access(src);
      } catch {
        continue;
      }
      try {
        await fs.access(dest);
        // New file already exists — drop the legacy copy
        await fs.unlink(src);
      } catch {
        await fs.rename(src, dest);
      }
    }
  }
}
