import { inline, MethodBadge } from "./inline";
import { isTableBlock, splitBlocks, stripLeadingH1 } from "./blocks";
import { DocsSmartTable, parseTable } from "./table";

export { stripLeadingH1 };

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
                    {inline(item.replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, ""), `li${i}-${j}`)}
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
