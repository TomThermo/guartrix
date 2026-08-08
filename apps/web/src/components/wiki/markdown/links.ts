import { safeExternalUrl } from "../../../lib/safeUrl";

/** Map docs/wiki/*.md → panel routes (API docs live under /api-docs). */
export const MD_TO_HREF: Record<string, string> = {
  "api-overview.md": "/api-docs",
  "api-explorer.md": "/api-docs/explorer",
  "api-examples.md": "/api-docs/examples",
  "api-conventions.md": "/api-docs/conventions",
  "client-api.md": "/api-docs/client",
  "application-api.md": "/api-docs/application",
  "api-docs-ui.md": "/api-docs",
  "accounts-and-quotas.md": "/wiki/accounts-quotas",
  "auth-and-session-internals.md": "/wiki/auth-session-internals",
  "security.md": "/wiki/security",
  "schedules.md": "/wiki/schedules",
  "server-management.md": "/wiki/server-management",
  "files-and-backups.md": "/wiki/files-backups",
  "api-surface-map.md": "/wiki/api-surface-map",
  "billing-internals.md": "/wiki/billing-internals",
  "licensing.md": "/wiki/licensing",
  "operations.md": "/wiki/operations",
  "panel-guide.md": "/wiki/panel-guide",
  "env-reference.md": "/wiki/env-reference",
};

export function resolveDocHref(
  href: string,
): { kind: "internal"; to: string } | { kind: "external"; href: string } | { kind: "text" } {
  const trimmed = href.trim();
  if (!trimmed) return { kind: "text" };
  if (/^https?:\/\//i.test(trimmed)) {
    const safe = safeExternalUrl(trimmed);
    return safe ? { kind: "external", href: safe } : { kind: "text" };
  }
  if (trimmed.startsWith("/wiki/") || trimmed.startsWith("/api-docs")) {
    return { kind: "internal", to: trimmed };
  }
  const bare = trimmed.replace(/^\.\.\//, "").replace(/^docs\/wiki\//, "");
  const file = bare.split("#")[0] ?? bare;
  const hash = bare.includes("#") ? `#${bare.split("#").slice(1).join("#")}` : "";
  const base = file.split("/").pop() ?? file;
  if (base.endsWith(".md")) {
    const path = MD_TO_HREF[base];
    if (path) return { kind: "internal", to: `${path}${hash}` };
  }
  if (base === "openapi.yaml" || bare.includes("openapi.yaml")) {
    return {
      kind: "external",
      href: "https://github.com/TomThermo/guartrix/blob/main/docs/openapi.yaml",
    };
  }
  return { kind: "text" };
}

export function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

export function extractLink(md: string): { label: string; href: string } | null {
  const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(md);
  if (!m) return null;
  return { label: m[1]!, href: m[2]! };
}
