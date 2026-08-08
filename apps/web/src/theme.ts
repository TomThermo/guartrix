import {
  applyPalettePreference,
  getPaletteMeta,
  readPalettePreference,
  type PaletteId,
} from "./palettes";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "guartrix.theme";

export function readThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)?.trim().toLowerCase();
    if (raw === "light" || raw === "system" || raw === "dark") return raw;
  } catch {
    // ignore
  }
  return "dark";
}

export function systemPrefersLight(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersLight() ? "light" : "dark";
  }
  return preference;
}

function syncThemeColorMeta(theme: ResolvedTheme, paletteId?: PaletteId): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const palette = getPaletteMeta(paletteId ?? readPalettePreference());
  meta.setAttribute(
    "content",
    theme === "light" ? palette.themeColorLight : palette.themeColorDark,
  );
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute("data-bs-theme", theme);
  syncThemeColorMeta(theme);
}

export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  applyResolvedTheme(resolved);
  return resolved;
}

/** Apply stored theme + palette (call once at boot). */
export function applyAppearanceBoot(): ResolvedTheme {
  applyPalettePreference(readPalettePreference());
  return applyThemePreference(readThemePreference());
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // ignore
  }
  return applyThemePreference(preference);
}

/** Keep `data-bs-theme` in sync when preference is `system`. Returns cleanup. */
export function watchSystemTheme(preference: ThemePreference): () => void {
  if (preference !== "system") return () => undefined;
  let mql: MediaQueryList;
  try {
    mql = window.matchMedia("(prefers-color-scheme: light)");
  } catch {
    return () => undefined;
  }
  const onChange = () => {
    applyResolvedTheme(systemPrefersLight() ? "light" : "dark");
  };
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** Re-sync theme-color meta after palette change (theme already applied). */
export function refreshThemeColorMeta(): void {
  const theme =
    (document.documentElement.getAttribute("data-bs-theme") as ResolvedTheme | null) ?? "dark";
  syncThemeColorMeta(theme === "light" ? "light" : "dark");
}
