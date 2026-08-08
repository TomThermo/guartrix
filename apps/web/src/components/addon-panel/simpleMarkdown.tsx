import type { ReactNode } from "react";
import { safeHttpUrl } from "../../lib/safeUrl";

/** Lightweight markdown-ish renderer (no extra dependency). */
export function SimpleMarkdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);

  function inline(raw: string): ReactNode[] {
    const parts: ReactNode[] = [];
    const re =
      /(!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
    let last = 0;
    let match: RegExpExecArray | null = re.exec(raw);
    let key = 0;
    while (match) {
      if (match.index > last) parts.push(raw.slice(last, match.index));
      if (match[1]?.startsWith("![")) {
        const src = safeHttpUrl(match[3]);
        if (src) {
          parts.push(<img key={key++} src={src} alt={match[2]} className="addon-md-img" />);
        } else {
          parts.push(match[2] || "");
        }
      } else if (match[1]?.startsWith("[")) {
        const href = safeHttpUrl(match[5]);
        if (href) {
          parts.push(
            <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
              {match[4]}
            </a>,
          );
        } else {
          parts.push(match[4] || "");
        }
      } else if (match[6]) {
        parts.push(<code key={key++}>{match[6]}</code>);
      } else if (match[7]) {
        parts.push(<strong key={key++}>{match[7]}</strong>);
      } else if (match[8]) {
        parts.push(<em key={key++}>{match[8]}</em>);
      }
      last = match.index + match[0].length;
      match = re.exec(raw);
    }
    if (last < raw.length) parts.push(raw.slice(last));
    return parts;
  }

  return (
    <div className="addon-markdown">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (/^###\s+/.test(trimmed)) {
          return <h4 key={i}>{inline(trimmed.replace(/^###\s+/, ""))}</h4>;
        }
        if (/^##\s+/.test(trimmed)) {
          return <h3 key={i}>{inline(trimmed.replace(/^##\s+/, ""))}</h3>;
        }
        if (/^#\s+/.test(trimmed)) {
          return <h2 key={i}>{inline(trimmed.replace(/^#\s+/, ""))}</h2>;
        }
        if (/^[-*]\s+/m.test(trimmed)) {
          const items = trimmed.split("\n").filter((l) => /^[-*]\s+/.test(l.trim()));
          if (items.length) {
            return (
              <ul key={i}>
                {items.map((item, j) => (
                  <li key={j}>{inline(item.replace(/^[-*]\s+/, ""))}</li>
                ))}
              </ul>
            );
          }
        }
        if (trimmed.startsWith("```")) {
          const code = trimmed.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
          return (
            <pre key={i}>
              <code>{code}</code>
            </pre>
          );
        }
        return (
          <p key={i}>
            {trimmed.split("\n").map((line, j, arr) => (
              <span key={j}>
                {inline(line)}
                {j < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
