import type { Monaco } from "@monaco-editor/react";

const DARK_ID = "guartrix-dark";
const LIGHT_ID = "guartrix-light";

let themesRegistered = false;

export function registerGuartrixMonacoThemes(monaco: Monaco): void {
  if (themesRegistered) return;
  themesRegistered = true;

  monaco.editor.defineTheme(DARK_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b7c72" },
      { token: "string", foreground: "9fd4a8" },
      { token: "keyword", foreground: "5dba6a" },
      { token: "number", foreground: "d4a84b" },
    ],
    colors: {
      "editor.background": "#0a0e0c",
      "editor.foreground": "#cfe3d4",
      "editorLineNumber.foreground": "#6b7c72",
      "editorLineNumber.activeForeground": "#8fa396",
      "editor.selectionBackground": "#24302a",
      "editor.inactiveSelectionBackground": "#1c2420",
      "editorCursor.foreground": "#5dba6a",
      "editor.lineHighlightBackground": "#141a17",
      "editorWidget.background": "#1c2420",
      "editorWidget.border": "#2f3d35",
      "editorSuggestWidget.background": "#1c2420",
      "editorSuggestWidget.border": "#2f3d35",
      "scrollbarSlider.background": "#2f3d3588",
      "scrollbarSlider.hoverBackground": "#3d4f4588",
    },
  });

  monaco.editor.defineTheme(LIGHT_ID, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b7c72" },
      { token: "string", foreground: "2f6e39" },
      { token: "keyword", foreground: "3d8f4a" },
      { token: "number", foreground: "b8860b" },
    ],
    colors: {
      "editor.background": "#f7faf8",
      "editor.foreground": "#1a221e",
      "editorLineNumber.foreground": "#8fa396",
      "editorLineNumber.activeForeground": "#5a6b62",
      "editor.selectionBackground": "#d5e8d9",
      "editor.inactiveSelectionBackground": "#e2e8e4",
      "editorCursor.foreground": "#3d8f4a",
      "editor.lineHighlightBackground": "#eef2ef",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#c5cfc8",
      "editorSuggestWidget.background": "#ffffff",
      "editorSuggestWidget.border": "#c5cfc8",
    },
  });
}

export function monacoThemeIdForDocument(): string {
  const theme = document.documentElement.getAttribute("data-bs-theme");
  return theme === "light" ? LIGHT_ID : DARK_ID;
}
