import { describe, expect, it } from "vitest";
import { en } from "./locales/en";
import { nl } from "./locales/nl";

/** Collect dotted paths to leaf string values in a nested catalog. */
function collectStringKeys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return [];
  }
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      keys.push(path);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...collectStringKeys(v, path));
    }
  }
  return keys;
}

describe("locale catalog parity (en ↔ nl)", () => {
  it("has the same nested string keys in both catalogs", () => {
    const enKeys = new Set(collectStringKeys(en));
    const nlKeys = new Set(collectStringKeys(nl));

    const missingInNl = [...enKeys].filter((k) => !nlKeys.has(k)).sort();
    const missingInEn = [...nlKeys].filter((k) => !enKeys.has(k)).sort();

    expect(missingInNl, `missing in nl.ts: ${missingInNl.join(", ")}`).toEqual([]);
    expect(missingInEn, `missing in en.ts: ${missingInEn.join(", ")}`).toEqual([]);
  });
});
