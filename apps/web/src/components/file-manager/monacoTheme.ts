import type { Monaco } from "@monaco-editor/react";
import { readMonacoPaletteColors } from "../../palettes";

const DARK_ID = "guartrix-dark";
const LIGHT_ID = "guartrix-light";

let lastMonaco: Monaco | null = null;

function hexNoHash(value: string): string {
  return value.replace(/^#/, "");
}

function defineThemes(monaco: Monaco): void {
  const dark = readMonacoPaletteColors("dark");
  const light = readMonacoPaletteColors("light");

  monaco.editor.defineTheme(DARK_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: hexNoHash(dark.stone) },
      { token: "string", foreground: dark.accentBright },
      { token: "keyword", foreground: dark.accent },
      { token: "number", foreground: dark.warn },
    ],
    colors: {
      "editor.background": dark.bg,
      "editor.foreground": dark.fg,
      "editorLineNumber.foreground": dark.stone,
      "editorLineNumber.activeForeground": dark.muted,
      "editor.selectionBackground": dark.hover,
      "editor.inactiveSelectionBackground": dark.raised,
      "editorCursor.foreground": `#${dark.accent}`,
      "editor.lineHighlightBackground": dark.bgPanel,
      "editorWidget.background": dark.raised,
      "editorWidget.border": dark.border,
      "editorSuggestWidget.background": dark.raised,
      "editorSuggestWidget.border": dark.border,
      "scrollbarSlider.background": `${dark.border}88`,
      "scrollbarSlider.hoverBackground": `${dark.hover}88`,
    },
  });

  monaco.editor.defineTheme(LIGHT_ID, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: hexNoHash(light.stone) },
      { token: "string", foreground: light.accentDim },
      { token: "keyword", foreground: light.accent },
      { token: "number", foreground: light.warn },
    ],
    colors: {
      "editor.background": light.bgPanel,
      "editor.foreground": light.fg,
      "editorLineNumber.foreground": light.muted,
      "editorLineNumber.activeForeground": light.stone,
      "editor.selectionBackground": light.hover,
      "editor.inactiveSelectionBackground": light.hover,
      "editorCursor.foreground": `#${light.accent}`,
      "editor.lineHighlightBackground": light.bgPanel,
      "editorWidget.background": light.raised,
      "editorWidget.border": light.border,
      "editorSuggestWidget.background": light.raised,
      "editorSuggestWidget.border": light.border,
    },
  });
}

export function registerGuartrixMonacoThemes(monaco: Monaco): void {
  lastMonaco = monaco;
  defineThemes(monaco);
}

/** Re-apply Monaco colors after palette/theme change. */
export function refreshGuartrixMonacoThemes(): void {
  if (!lastMonaco) return;
  defineThemes(lastMonaco);
}

export function monacoThemeIdForDocument(): string {
  const theme = document.documentElement.getAttribute("data-bs-theme");
  return theme === "light" ? LIGHT_ID : DARK_ID;
}
