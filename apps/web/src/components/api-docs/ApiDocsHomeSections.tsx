import { Link } from "react-router-dom";
import { apiDocsHref } from "../../api-docs/api-docs-content";

type BrowseItem = {
  title: string;
  path?: string;
  description: string;
  to: string;
  external?: boolean;
};

const BROWSE: BrowseItem[] = [
  {
    title: "API Reference",
    path: "/api-docs",
    description: "Live overview, explorer, examples, conventions, Client & Application APIs.",
    to: "/api-docs",
  },
  {
    title: "API explorer",
    description: "Interactive Try it + multi-language snippets (cURL, Node, Python, PHP, …).",
    to: apiDocsHref("explorer"),
  },
  {
    title: "API examples",
    description: "Copy-paste curl commands and sample JSON responses.",
    to: apiDocsHref("examples"),
  },
  {
    title: "API conventions",
    description: "Errors, rate limits, auth headers, and pagination.",
    to: apiDocsHref("conventions"),
  },
  {
    title: "Client API",
    description: "Personal gt_ keys — permissions and endpoint index.",
    to: apiDocsHref("client"),
  },
  {
    title: "Application API",
    description: "Machine gta_ keys — billing and provisioning.",
    to: apiDocsHref("application"),
  },
  {
    title: "OpenAPI",
    description: "Machine-readable schema for codegen and tooling.",
    to: "https://github.com/TomThermo/guartrix/blob/main/docs/openapi.yaml",
    external: true,
  },
];

const AUTH = [
  {
    type: "Browser session",
    prefix: "Cookie sid",
    who: "Logged-in user",
    create: "—",
    use: "Panel UI",
  },
  {
    type: "Client API",
    prefix: "gt_",
    who: "Any user",
    create: "Account → Security → Access → API keys",
    use: "Scripts, CI, your own servers",
  },
  {
    type: "Application API",
    prefix: "gta_",
    who: "Machine (admin)",
    create: "Admin → API keys (Application API keys)",
    use: "WHMCS, custom billing, provisioning",
  },
  {
    type: "App password",
    prefix: "gtap_",
    who: "SFTP only",
    create: "Account → Security → Access",
    use: "FileZilla / SFTP — not HTTP",
  },
];

export function ApiDocsHomeSections() {
  return (
    <>
      <section className="docs-home-section">
        <h2 className="docs-home-section-title">Browse the API docs</h2>
        <p className="docs-home-section-lead">
          Pick a guide — these open the dedicated API Reference (not the wiki).
        </p>
        <div className="docs-card-grid">
          {BROWSE.map((item) => {
            const inner = (
              <>
                <div className="docs-card-title-row">
                  <span className="docs-card-title">{item.title}</span>
                  {item.path ? <code className="docs-card-path">{item.path}</code> : null}
                </div>
                <p className="docs-card-desc">{item.description}</p>
                <span className="docs-card-arrow" aria-hidden>
                  {item.external ? "↗" : "→"}
                </span>
              </>
            );
            if (item.external) {
              return (
                <a
                  key={item.title}
                  href={item.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="docs-card docs-card--link"
                >
                  {inner}
                </a>
              );
            }
            return (
              <Link key={item.title} to={item.to} className="docs-card docs-card--link">
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="docs-home-section">
        <h2 className="docs-home-section-title">Authentication</h2>
        <p className="docs-home-section-lead">
          Choose the right credential for the job. HTTP automation uses Bearer <code>gt_</code> or{" "}
          <code>gta_</code>.
        </p>
        <div className="docs-auth-grid">
          {AUTH.map((row) => (
            <div key={row.type} className="docs-auth-card">
              <div className="docs-auth-card-head">
                <h3 className="docs-auth-card-title">{row.type}</h3>
                <code className="docs-auth-prefix">{row.prefix}</code>
              </div>
              <dl className="docs-auth-meta">
                <dt>Who</dt>
                <dd>{row.who}</dd>
                <dt>Create</dt>
                <dd>{row.create}</dd>
                <dt>Use</dt>
                <dd>{row.use}</dd>
              </dl>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
