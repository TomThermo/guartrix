import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { isSeparatorRow } from "./blocks";
import { inline, isHttpMethod, MethodBadge } from "./inline";
import { extractLink, plainText, resolveDocHref } from "./links";

export function parseTable(trimmed: string): { headers: string[]; rows: string[][] } {
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

type TableKind = "link-cards" | "auth-cards" | "endpoints" | "data";

export function classifyTable(headers: string[], rows: string[][]): TableKind {
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
  if (
    headers.length === 2 &&
    rows.some((r) => /\[.+\]\(.+\)/.test(r[0] ?? "") || /`\/[^`]+`/.test(r[0] ?? ""))
  ) {
    return "link-cards";
  }
  return "data";
}

function renderTableCell(value: string, header: string, keyPrefix: string): ReactNode {
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

export function DocsSmartTable({
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
                <td key={c}>{renderTableCell(row[c] ?? "", header, `td${blockKey}-${r}-${c}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
