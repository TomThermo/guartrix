import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { safeExternalUrl } from "../../../lib/safeUrl";
import { resolveDocHref } from "./links";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value.toUpperCase());
}

export function methodClass(method: string): string {
  return `docs-method docs-method--${method.toLowerCase()}`;
}

export function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  return <span className={methodClass(m)}>{m}</span>;
}

/** Render inline markdown + HTTP method badges. */
export function inline(raw: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Order: images, links, `code`, **bold**, bare METHOD tokens
  const re =
    /(!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b)/g;
  let last = 0;
  let match: RegExpExecArray | null = re.exec(raw);
  let key = 0;
  while (match) {
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
            <MethodBadge method={meth!} /> <span className="docs-path">{rest.join(" ")}</span>
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
    match = re.exec(raw);
  }
  if (last < raw.length) parts.push(raw.slice(last));
  return parts;
}
