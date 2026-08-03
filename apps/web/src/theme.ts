export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "guartrix.theme";
export const THEME_COLOR_DARK = "#1a1d23";
export const THEME_COLOR_LIGHT = "#e8ece9";

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

export function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute("data-bs-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      theme === "light" ? THEME_COLOR_LIGHT : THEME_COLOR_DARK,
    );
  }
}

export function applyThemePreference(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  applyResolvedTheme(resolved);
  return resolved;
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
