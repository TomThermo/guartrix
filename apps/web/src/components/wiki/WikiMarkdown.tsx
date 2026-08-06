import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Map docs/wiki/*.md → panel routes (API docs live under /api-docs). */
const MD_TO_HREF: Record<string, string> = {
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

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value.toUpperCase());
}

function methodClass(method: string): string {
  return `docs-method docs-method--${method.toLowerCase()}`;
}

function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  return <span className={methodClass(m)}>{m}</span>;
}

function safeExternalUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

function resolveDocHref(
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

/** Render inline markdown + HTTP method badges. */
function inline(raw: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Order: images, links, `code`, **bold**, bare METHOD tokens
  const re =
    /(!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(raw))) {
    if (match.index > last) parts.push(raw.slice(last, match.index));
    if (match[1]?.startsWith("![")) {
      const src = safeExternalUrl(match[3] ?? "");
      if (src) {
        parts.push(<img key={`${keyPrefix}-i${key++}`} src={src} alt={match[2] ?? ""} />);
      } else {
        parts.push(match[2] || "");
      }
    } else if (match[1]?.startsWith("[")) {
      const label = match[4] ?? "";
      const target = resolveDocHref(match[5] ?? "");
      if (target.kind === "internal") {
        parts.push(
          <Link key={`${keyPrefix}-i${key++}`} to={target.to}>
            {inline(label, `${keyPrefix}-l${key}`)}
          </Link>,
        );
      } else if (target.kind === "external") {
        parts.push(
          <a
            key={`${keyPrefix}-i${key++}`}
            href={target.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {inline(label, `${keyPrefix}-l${key}`)}
          </a>,
        );
      } else {
        parts.push(...inline(label, `${keyPrefix}-l${key++}`));
      }
    } else if (match[6] != null) {
      const code = match[6];
      if (isHttpMethod(code.trim())) {
        parts.push(<MethodBadge key={`${keyPrefix}-i${key++}`} method={code.trim()} />);
      } else if (/^(GET|POST|PUT|PATCH|DELETE)\s+\S/.test(code.trim())) {
        const [meth, ...rest] = code.trim().split(/\s+/);
        parts.push(
          <code key={`${keyPrefix}-i${key++}`} className="docs-inline-endpoint">
            <MethodBadge method={meth!} />{" "}
            <span className="docs-path">{rest.join(" ")}</span>
          </code>,
        );
      } else {
        parts.push(<code key={`${keyPrefix}-i${key++}`}>{code}</code>);
      }
    } else if (match[7]) {
      parts.push(<strong key={`${keyPrefix}-i${key++}`}>{match[7]}</strong>);
    } else if (match[8]) {
      parts.push(<MethodBadge key={`${keyPrefix}-i${key++}`} method={match[8]} />);
    }
    last = match.index + match[0].length;
  }
  if (last < raw.length) parts.push(raw.slice(last));
  return parts;
}

function isSeparatorRow(line: string): boolean {
  const t = line.trim();
  // e.g. |-----|----------------|  — hyphen must not sit between : and | in a char class
  // (that would be a range from ":" to "|", which excludes ASCII "-").
  return /^\|?[:\-\s|]+\|?$/.test(t) && /[-:]/.test(t) && !/[A-Za-z0-9]/.test(t);
}

function isTableBlock(trimmed: string): boolean {
  const lines = trimmed.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;
  if (!lines[0]!.includes("|")) return false;
  return isSeparatorRow(lines[1]!);
}

function parseTable(trimmed: string): { headers: string[]; rows: string[][] } {
  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !isSeparatorRow(l));
  const splitRow = (line: string) =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const headers = splitRow(lines[0] ?? "");
  const rows = lines.slice(1).map(splitRow);
  return { headers, rows };
}

function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

function extractLink(md: string): { label: string; href: string } | null {
  const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(md);
  if (!m) return null;
  return { label: m[1]!, href: m[2]! };
}

type TableKind = "link-cards" | "auth-cards" | "endpoints" | "data";

function classifyTable(headers: string[], rows: string[][]): TableKind {
  const h = headers.map((x) => plainText(x).toLowerCase());
  if (h.includes("method") && (h.includes("path") || h.includes("endpoint"))) {
    return "endpoints";
  }
  if (
    h[0] === "type" &&
    h.some((x) => x.includes("prefix")) &&
    h.some((x) => x.includes("who") || x.includes("create") || x.includes("use"))
  ) {
    return "auth-cards";
  }
  // Doc / page indexes (2–3 cols) → cards — not comparison matrices like Need|Client|App
  if (
    (headers.length === 2 || headers.length === 3) &&
    rows.length >= 1 &&
    h[0] !== "need" &&
    (h[0] === "doc" ||
      h[0] === "page" ||
      h[0] === "guide" ||
      h[0] === "topic" ||
      h[0] === "area" ||
      h[0]?.includes("doc") ||
      h[1]?.includes("inside") ||
      h[1]?.includes("description") ||
      h[1] === "notes" ||
      h[1] === "guide" ||
      h[1]?.includes("base path"))
  ) {
    return "link-cards";
  }
  if (headers.length === 2 && rows.some((r) => /\[.+\]\(.+\)/.test(r[0] ?? "") || /`\/[^`]+`/.test(r[0] ?? ""))) {
    return "link-cards";
  }
  return "data";
}

function renderTableCell(
  value: string,
  header: string,
  keyPrefix: string,
): ReactNode {
  const h = header.toLowerCase();
  if ((h === "method" || h === "verb") && isHttpMethod(value.replace(/[`*]/g, "").trim())) {
    return <MethodBadge method={value.replace(/[`*]/g, "").trim()} />;
  }
  if (h === "path" || h === "base path" || h === "endpoint") {
    const clean = value.replace(/^`+|`+$/g, "");
    // Path cells may contain "POST /api/…"
    const m = /^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i.exec(clean);
    if (m) {
      return (
        <span className="docs-inline-endpoint">
          <MethodBadge method={m[1]!} />
          <code className="docs-path">{m[2]}</code>
        </span>
      );
    }
    return <code className="docs-path">{clean}</code>;
  }
  return <>{inline(value, keyPrefix)}</>;
}

function DocsSmartTable({
  headers,
  rows,
  blockKey,
}: {
  headers: string[];
  rows: string[][];
  blockKey: number;
}) {
  const kind = classifyTable(headers, rows);

  if (kind === "link-cards") {
    return (
      <div className="docs-card-grid" key={blockKey}>
        {rows.map((row, r) => {
          const titleMd = row[0] ?? "";
          const midMd = headers.length >= 3 ? (row[1] ?? "") : "";
          const descMd = headers.length >= 3 ? (row[2] ?? "") : (row[1] ?? "");
          const link = extractLink(titleMd) ?? extractLink(descMd);
          const resolved = link ? resolveDocHref(link.href) : null;
          const title = plainText(titleMd);
          const desc = plainText(descMd);
          const pathHint =
            /`(\/[^`]+)`/.exec(titleMd)?.[1] ??
            /`(\/[^`]+)`/.exec(midMd)?.[1] ??
            (midMd.startsWith("/") ? plainText(midMd) : undefined);

          const inner = (
            <>
              <div className="docs-card-title-row">
                <span className="docs-card-title">{title}</span>
                {pathHint ? <code className="docs-card-path">{pathHint}</code> : null}
              </div>
              {desc ? <p className="docs-card-desc">{desc}</p> : null}
            </>
          );

          if (resolved?.kind === "internal") {
            return (
              <Link key={r} to={resolved.to} className="docs-card docs-card--link">
                {inner}
                <span className="docs-card-arrow" aria-hidden>
                  →
                </span>
              </Link>
            );
          }
          if (resolved?.kind === "external") {
            return (
              <a
                key={r}
                href={resolved.href}
                target="_blank"
                rel="noopener noreferrer"
                className="docs-card docs-card--link"
              >
                {inner}
                <span className="docs-card-arrow" aria-hidden>
                  ↗
                </span>
              </a>
            );
          }
          return (
            <div key={r} className="docs-card">
              {inner}
            </div>
          );
        })}
      </div>
    );
  }

  if (kind === "auth-cards") {
    const idx = {
      type: headers.findIndex((h) => plainText(h).toLowerCase() === "type"),
      prefix: headers.findIndex((h) => plainText(h).toLowerCase().includes("prefix")),
      who: headers.findIndex((h) => plainText(h).toLowerCase() === "who"),
      create: headers.findIndex((h) => plainText(h).toLowerCase().includes("create")),
      use: headers.findIndex((h) =>
        ["typical use", "use", "audience"].includes(plainText(h).toLowerCase()),
      ),
    };
    return (
      <div className="docs-auth-grid" key={blockKey}>
        {rows.map((row, r) => (
          <div key={r} className="docs-auth-card">
            <div className="docs-auth-card-head">
              <h4 className="docs-auth-card-title">
                {inline(row[idx.type] ?? row[0] ?? "", `auth-t-${r}`)}
              </h4>
              {idx.prefix >= 0 && row[idx.prefix] && (
                <code className="docs-auth-prefix">{plainText(row[idx.prefix]!)}</code>
              )}
            </div>
            <dl className="docs-auth-meta">
              {idx.who >= 0 && row[idx.who] && (
                <>
                  <dt>Who</dt>
                  <dd>{inline(row[idx.who]!, `auth-w-${r}`)}</dd>
                </>
              )}
              {idx.create >= 0 && row[idx.create] && (
                <>
                  <dt>Create</dt>
                  <dd>{inline(row[idx.create]!, `auth-c-${r}`)}</dd>
                </>
              )}
              {idx.use >= 0 && row[idx.use] && (
                <>
                  <dt>Use</dt>
                  <dd>{inline(row[idx.use]!, `auth-u-${r}`)}</dd>
                </>
              )}
            </dl>
          </div>
        ))}
      </div>
    );
  }

  if (kind === "endpoints") {
    const methodIdx = headers.findIndex((h) =>
      ["method", "verb"].includes(plainText(h).toLowerCase()),
    );
    const pathIdx = headers.findIndex((h) =>
      ["path", "endpoint", "base path"].includes(plainText(h).toLowerCase()),
    );
    const noteIdx = headers.findIndex((_, i) => i !== methodIdx && i !== pathIdx);
    return (
      <div className="docs-endpoint-list" key={blockKey}>
        {rows.map((row, r) => {
          const method = (row[methodIdx] ?? "").replace(/[`*]/g, "").trim();
          const path = (row[pathIdx] ?? "").replace(/^`+|`+$/g, "");
          const note = noteIdx >= 0 ? row[noteIdx] : "";
          return (
            <div key={r} className="docs-endpoint-row">
              <div className="docs-endpoint-row-main">
                {isHttpMethod(method) ? <MethodBadge method={method} /> : null}
                <code className="docs-path">{path}</code>
              </div>
              {note ? (
                <div className="docs-endpoint-row-note">{inline(note, `ep-n-${r}`)}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  // Default polished data table
  return (
    <div className="wiki-table-wrap docs-table-wrap docs-table-wrap--data" key={blockKey}>
      <table className="wiki-table docs-table">
        <thead>
          <tr>
            {headers.map((h, j) => (
              <th key={j}>{inline(h, `th${blockKey}-${j}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {headers.map((header, c) => (
                <td key={c}>
                  {renderTableCell(row[c] ?? "", header, `td${blockKey}-${r}-${c}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Split markdown into top-level blocks (fences stay intact). */
function splitBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks: string[] = [];
  let i = 0;
  const lines = normalized.split("\n");
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      const fence = [line];
      i += 1;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        fence.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) fence.push(lines[i]!);
      i += 1;
      blocks.push(fence.join("\n"));
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const chunk: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i]!.trim()) {
      if (lines[i]!.startsWith("```")) break;
      // Keep table rows together even with blank? tables don't have blanks mid-block in our splitter
      chunk.push(lines[i]!);
      i += 1;
    }
    blocks.push(chunk.join("\n"));
  }
  return blocks;
}

/** Drop the first H1 (page already shows the title). */
export function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+[^\n]+\n+/, "");
}

function HeadingWithMethod({
  level,
  text,
  keyPrefix,
}: {
  level: 2 | 3 | 4;
  text: string;
  keyPrefix: string;
}) {
  const m = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i.exec(text.trim());
  const Tag = level === 2 ? "h2" : level === 3 ? "h3" : "h4";
  if (m) {
    const pathPart = m[2]!.replace(/^`+|`+$/g, "");
    return (
      <Tag className="docs-endpoint-heading">
        <MethodBadge method={m[1]!} />
        <code className="docs-path">{pathPart}</code>
      </Tag>
    );
  }
  return <Tag>{inline(text, keyPrefix)}</Tag>;
}

export function WikiMarkdown({ text }: { text: string }) {
  const body = stripLeadingH1(text.trim());
  const blocks = splitBlocks(body);

  return (
    <div className="wiki-markdown docs-markdown">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("```")) {
          const firstNl = trimmed.indexOf("\n");
          const open = firstNl === -1 ? trimmed : trimmed.slice(0, firstNl);
          const lang = open.replace(/^```/, "").trim() || "text";
          let code = firstNl === -1 ? "" : trimmed.slice(firstNl + 1);
          if (code.endsWith("```")) code = code.slice(0, -3);
          if (code.endsWith("\n")) code = code.slice(0, -1);

          // http request fences: highlight first-line method
          if (lang === "http" || lang === "HTTP") {
            const lines = code.split("\n");
            const first = lines[0] ?? "";
            const hm = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)(.*)$/i.exec(first);
            if (hm) {
              return (
                <div key={i} className="wiki-code-block docs-http-block">
                  <div className="wiki-code-label">http</div>
                  <div className="docs-http-request">
                    <div className="docs-http-request-line">
                      <MethodBadge method={hm[1]!} />
                      <code className="docs-path">{hm[2]}</code>
                      {hm[3] ? <span className="docs-http-rest">{hm[3]}</span> : null}
                    </div>
                    {lines.length > 1 && (
                      <pre>
                        <code>{lines.slice(1).join("\n")}</code>
                      </pre>
                    )}
                  </div>
                </div>
              );
            }
          }

          return (
            <div key={i} className="wiki-code-block">
              <div className="wiki-code-label">{lang}</div>
              <pre>
                <code>{code}</code>
              </pre>
            </div>
          );
        }

        if (
          /^>\s?/m.test(trimmed) &&
          trimmed.split("\n").every((l) => /^>\s?|^$/.test(l.trim()) || l.startsWith(">"))
        ) {
          const quote = trimmed
            .split("\n")
            .map((l) => l.replace(/^>\s?/, ""))
            .join("\n")
            .trim();
          return (
            <blockquote key={i}>
              {quote.split("\n\n").map((p, j) => (
                <p key={j}>{inline(p.replace(/\n/g, " "), `q${i}-${j}`)}</p>
              ))}
            </blockquote>
          );
        }

        if (isTableBlock(trimmed)) {
          const { headers, rows } = parseTable(trimmed);
          return <DocsSmartTable key={i} headers={headers} rows={rows} blockKey={i} />;
        }

        if (/^####\s+/.test(trimmed)) {
          return (
            <HeadingWithMethod
              key={i}
              level={4}
              text={trimmed.replace(/^####\s+/, "")}
              keyPrefix={`h4-${i}`}
            />
          );
        }
        if (/^###\s+/.test(trimmed)) {
          return (
            <HeadingWithMethod
              key={i}
              level={3}
              text={trimmed.replace(/^###\s+/, "")}
              keyPrefix={`h3-${i}`}
            />
          );
        }
        if (/^##\s+/.test(trimmed)) {
          return (
            <HeadingWithMethod
              key={i}
              level={2}
              text={trimmed.replace(/^##\s+/, "")}
              keyPrefix={`h2-${i}`}
            />
          );
        }
        if (/^#\s+/.test(trimmed)) {
          return (
            <HeadingWithMethod
              key={i}
              level={2}
              text={trimmed.replace(/^#\s+/, "")}
              keyPrefix={`h1-${i}`}
            />
          );
        }

        if (/^[-*]\s+/m.test(trimmed) || /^\d+\.\s+/m.test(trimmed)) {
          const lines = trimmed.split("\n");
          const ordered = /^\d+\.\s+/.test(lines[0]!.trim());
          const items = lines.filter((l) =>
            ordered ? /^\d+\.\s+/.test(l.trim()) : /^[-*]\s+/.test(l.trim()),
          );
          if (items.length) {
            const ListTag = ordered ? "ol" : "ul";
            return (
              <ListTag key={i}>
                {items.map((item, j) => (
                  <li key={j}>
                    {inline(
                      item.replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ""),
                      `li${i}-${j}`,
                    )}
                  </li>
                ))}
              </ListTag>
            );
          }
        }

        return (
          <p key={i}>
            {trimmed.split("\n").map((line, j, arr) => (
              <span key={j}>
                {inline(line, `p${i}-${j}`)}
                {j < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
