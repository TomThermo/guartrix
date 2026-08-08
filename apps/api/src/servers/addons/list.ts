import fs from "node:fs/promises";
import path from "node:path";
import type { AddonCategory, ServerType } from "@msm/shared";
import { LOADER_CATEGORY_NAMES, categoryLabel, fetchJson } from "../addons-modrinth.js";
import { kindFor, readManifest, writeManifest } from "./manifest.js";
import type { InstalledAddon } from "./types.js";

export async function listAddonCategories(type: ServerType): Promise<AddonCategory[]> {
  const kind = kindFor(type);
  if (!kind) return [];

  const tags = await fetchJson<{ name: string; project_type: string; header: string }[]>(
    "https://api.modrinth.com/v2/tag/category",
  );

  // Plugins on Modrinth reuse the same category names as mods.
  const filtered = tags.filter(
    (t) =>
      t.project_type === "mod" && t.header === "categories" && !LOADER_CATEGORY_NAMES.has(t.name),
  );

  const seen = new Set<string>();
  const out: AddonCategory[] = [];
  for (const tag of filtered) {
    if (seen.has(tag.name)) continue;
    seen.add(tag.name);
    out.push({ name: tag.name, label: categoryLabel(tag.name) });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export async function listInstalledAddons(serverDir: string): Promise<InstalledAddon[]> {
  const manifest = await readManifest(serverDir);
  const kept: InstalledAddon[] = [];
  let mutated = false;

  for (const addon of manifest.addons) {
    const dir =
      addon.kind === "plugin" ? path.join(serverDir, "plugins") : path.join(serverDir, "mods");
    try {
      await fs.access(path.join(dir, addon.fileName));
    } catch {
      mutated = true;
      continue;
    }

    let next = addon;
    if (!addon.iconUrl) {
      try {
        const project = await fetchJson<{
          id: string;
          slug: string;
          title: string;
          description?: string;
          icon_url?: string | null;
          categories?: string[];
        }>(`https://api.modrinth.com/v2/project/${addon.projectId}`);
        let author: string | null = addon.author ?? null;
        try {
          const members = await fetchJson<{ user: { username: string }; role: string }[]>(
            `https://api.modrinth.com/v2/project/${addon.projectId}/members`,
          );
          const owner = members.find((m) => m.role.toLowerCase() === "owner") ?? members[0];
          author = owner?.user.username ?? author;
        } catch {
          // ignore
        }
        next = {
          ...addon,
          slug: project.slug || addon.slug,
          title: project.title || addon.title,
          iconUrl: project.icon_url ?? null,
          description: project.description ?? addon.description ?? null,
          author,
          categories: project.categories ?? addon.categories ?? [],
        };
        mutated = true;
      } catch {
        // keep as-is if Modrinth is unreachable
      }
    }
    kept.push(next);
  }

  if (mutated || kept.length !== manifest.addons.length) {
    await writeManifest(serverDir, { addons: kept });
  }
  return kept;
}
