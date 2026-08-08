import { loader } from "@monaco-editor/react";

let configured = false;

/**
 * Load Monaco via AMD from self-hosted `/monaco/vs` (copied at Vite build/dev start).
 * Avoids bundling the ~4–5 MiB ESM graph into the SPA chunk.
 */
export function configureMonacoLoader(): void {
  if (configured || typeof window === "undefined") return;
  configured = true;

  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  loader.config({
    paths: {
      vs: `${base}monaco/vs`,
    },
  });
}
