/** Accent / surface palettes — applied via `data-bh-palette` on `<html>`. */

export const PALETTE_IDS = [
  "slate",
  "teal",
  "amber",
  "violet",
  "crimson",
  "mono",
  "forest",
  "midnight",
  "ember",
  "sand",
  "neon",
  "blossom",
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

/** Visual mood — changes radii, borders, and card chrome via CSS. */
export type PaletteMood = "sharp" | "soft" | "round" | "flat" | "glow" | "paper" | "edge" | "warm";

export const DEFAULT_PALETTE: PaletteId = "crimson";
export const PALETTE_STORAGE_KEY = "guartrix.palette";

export type PaletteSwatch = {
  deep: string;
  raised: string;
  accent: string;
  /** Optional second accent for dual-tone mockups */
  accent2?: string;
};

export type PaletteMeta = {
  id: PaletteId;
  /** i18n key under `account.palette*` */
  nameKey: string;
  hintKey: string;
  mood: PaletteMood;
  /** Swatch for dark preview (deep → raised → accent) */
  dark: PaletteSwatch;
  /** Swatch for light preview */
  light: PaletteSwatch;
  /** `theme-color` meta when this palette is active */
  themeColorDark: string;
  themeColorLight: string;
};

export const PALETTES: readonly PaletteMeta[] = [
  {
    id: "slate",
    nameKey: "account.paletteSlate",
    hintKey: "account.paletteSlateHint",
    mood: "edge",
    dark: { deep: "#0b0f14", raised: "#151b24", accent: "#5b8def" },
    light: { deep: "#e4e8ef", raised: "#ffffff", accent: "#3a6fd0" },
    themeColorDark: "#0b0f14",
    themeColorLight: "#e4e8ef",
  },
  {
    id: "teal",
    nameKey: "account.paletteTeal",
    hintKey: "account.paletteTealHint",
    mood: "glow",
    dark: { deep: "#0a1214", raised: "#132022", accent: "#2ec4b6" },
    light: { deep: "#e2ecec", raised: "#ffffff", accent: "#1a9e93" },
    themeColorDark: "#0a1214",
    themeColorLight: "#e2ecec",
  },
  {
    id: "amber",
    nameKey: "account.paletteAmber",
    hintKey: "account.paletteAmberHint",
    mood: "warm",
    dark: { deep: "#0f1012", raised: "#1a1c20", accent: "#f5a524" },
    light: { deep: "#eceae4", raised: "#ffffff", accent: "#c47d0a" },
    themeColorDark: "#0f1012",
    themeColorLight: "#eceae4",
  },
  {
    id: "violet",
    nameKey: "account.paletteViolet",
    hintKey: "account.paletteVioletHint",
    mood: "soft",
    dark: { deep: "#0d0e14", raised: "#171925", accent: "#8b7cf6" },
    light: { deep: "#e8e7ef", raised: "#ffffff", accent: "#6b5ce0" },
    themeColorDark: "#0d0e14",
    themeColorLight: "#e8e7ef",
  },
  {
    id: "crimson",
    nameKey: "account.paletteCrimson",
    hintKey: "account.paletteCrimsonHint",
    mood: "flat",
    dark: { deep: "#100e10", raised: "#1c181b", accent: "#e35d6a" },
    light: { deep: "#efe8ea", raised: "#ffffff", accent: "#c43d4c" },
    themeColorDark: "#100e10",
    themeColorLight: "#efe8ea",
  },
  {
    id: "mono",
    nameKey: "account.paletteMono",
    hintKey: "account.paletteMonoHint",
    mood: "sharp",
    dark: { deep: "#0c0c0c", raised: "#161616", accent: "#9aa3ad" },
    light: { deep: "#e8e8e8", raised: "#ffffff", accent: "#5c6570" },
    themeColorDark: "#0c0c0c",
    themeColorLight: "#e8e8e8",
  },
  /* —— Unique set 2: different surface families, not accent-only —— */
  {
    id: "forest",
    nameKey: "account.paletteForest",
    hintKey: "account.paletteForestHint",
    mood: "glow",
    dark: { deep: "#0a140e", raised: "#15241a", accent: "#5dba6a", accent2: "#3d8f4a" },
    light: { deep: "#dfe9e2", raised: "#f4faf5", accent: "#2f6e39", accent2: "#3d8f4a" },
    themeColorDark: "#0a140e",
    themeColorLight: "#dfe9e2",
  },
  {
    id: "midnight",
    nameKey: "account.paletteMidnight",
    hintKey: "account.paletteMidnightHint",
    mood: "edge",
    dark: { deep: "#040812", raised: "#0c1428", accent: "#e8c547", accent2: "#4a7dff" },
    light: { deep: "#d8e0f0", raised: "#f4f6fc", accent: "#b8941f", accent2: "#2a55c8" },
    themeColorDark: "#040812",
    themeColorLight: "#d8e0f0",
  },
  {
    id: "ember",
    nameKey: "account.paletteEmber",
    hintKey: "account.paletteEmberHint",
    mood: "warm",
    dark: { deep: "#140a06", raised: "#24160e", accent: "#ff6b35", accent2: "#ffb347" },
    light: { deep: "#f0e4d8", raised: "#fff8f2", accent: "#d44a1a", accent2: "#e08a30" },
    themeColorDark: "#140a06",
    themeColorLight: "#f0e4d8",
  },
  {
    id: "sand",
    nameKey: "account.paletteSand",
    hintKey: "account.paletteSandHint",
    mood: "paper",
    dark: { deep: "#1c1812", raised: "#2a241c", accent: "#c45c26", accent2: "#d4a574" },
    light: { deep: "#ebe3d4", raised: "#faf6ee", accent: "#a04820", accent2: "#8b6914" },
    themeColorDark: "#1c1812",
    themeColorLight: "#ebe3d4",
  },
  {
    id: "neon",
    nameKey: "account.paletteNeon",
    hintKey: "account.paletteNeonHint",
    mood: "sharp",
    dark: { deep: "#020308", raised: "#0a0c12", accent: "#00f0ff", accent2: "#ff2bd6" },
    light: { deep: "#dce8f0", raised: "#f2f7fa", accent: "#008a99", accent2: "#c4009a" },
    themeColorDark: "#020308",
    themeColorLight: "#dce8f0",
  },
  {
    id: "blossom",
    nameKey: "account.paletteBlossom",
    hintKey: "account.paletteBlossomHint",
    mood: "round",
    dark: { deep: "#160e14", raised: "#241820", accent: "#f472b6", accent2: "#c084fc" },
    light: { deep: "#f0e4ec", raised: "#fff7fb", accent: "#db2777", accent2: "#9333ea" },
    themeColorDark: "#160e14",
    themeColorLight: "#f0e4ec",
  },
] as const;

export function isPaletteId(value: string | null | undefined): value is PaletteId {
  return !!value && (PALETTE_IDS as readonly string[]).includes(value);
}

export function readPalettePreference(): PaletteId {
  try {
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY)?.trim().toLowerCase();
    if (isPaletteId(raw)) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_PALETTE;
}

export function getPaletteMeta(id: PaletteId): PaletteMeta {
  return PALETTES.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === DEFAULT_PALETTE)!;
}

export function applyPalettePreference(id: PaletteId): void {
  const meta = getPaletteMeta(id);
  document.documentElement.setAttribute("data-bh-palette", id);
  document.documentElement.setAttribute("data-bh-mood", meta.mood);
}

export function setPalettePreference(id: PaletteId): void {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, id);
  } catch {
    // ignore
  }
  applyPalettePreference(id);
}

/** Live `--bh-accent` from the applied palette (for charts / canvas). */
export function readCssAccent(fallback = "#e35d6a"): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--bh-accent").trim();
    if (v) return v;
  } catch {
    // ignore
  }
  return fallback;
}

function readCssVar(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return v;
  } catch {
    // ignore
  }
  return fallback;
}

/** Snapshot of palette CSS vars for Monaco (flips theme briefly to read both modes). */
export function readMonacoPaletteColors(mode: "dark" | "light") {
  const root = document.documentElement;
  const prevTheme = root.getAttribute("data-bs-theme");
  root.setAttribute("data-bs-theme", mode);
  void root.offsetHeight;

  const accent = readCssAccent(mode === "light" ? "#c43d4c" : "#e35d6a");
  const accentDim = readCssVar("--bh-accent-dim", mode === "light" ? "#9a2f3b" : "#b84450");
  const accentBright = readCssVar("--bh-accent-bright", mode === "light" ? "#d65a66" : "#f08a94");
  const snapshot = {
    accent: accent.replace("#", ""),
    accentDim: accentDim.replace("#", ""),
    accentBright: accentBright.replace("#", ""),
    bg: readCssVar("--bh-console-bg", mode === "light" ? "#f7f1f2" : "#0c0a0b"),
    fg: readCssVar("--bh-text", mode === "light" ? "#1f1518" : "#f3ecee"),
    muted: readCssVar("--bh-muted", mode === "light" ? "#746266" : "#a39498"),
    stone: readCssVar("--bh-stone", "#7a6e72"),
    raised: readCssVar("--bh-bg-raised", mode === "light" ? "#ffffff" : "#1c181b"),
    hover: readCssVar("--bh-bg-hover", mode === "light" ? "#ebe2e4" : "#272124"),
    border: readCssVar("--bh-border", mode === "light" ? "#d4c6c9" : "#3a3236"),
    bgPanel: readCssVar("--bh-bg", mode === "light" ? "#f7f1f2" : "#161316"),
    warn: readCssVar("--bh-warn", mode === "light" ? "#b8860b" : "#d4a84b").replace("#", ""),
  };

  if (prevTheme) root.setAttribute("data-bs-theme", prevTheme);
  else root.removeAttribute("data-bs-theme");
  return snapshot;
}
