import { Link } from "react-router-dom";
import { apiDocsGroups, apiDocsHref, apiDocsPages } from "../../api-docs/api-docs-content";

export function ApiDocsSidebar({ activeSlug }: { activeSlug?: string }) {
  return (
    <aside className="api-docs-sidebar" aria-label="API documentation">
      <div className="api-docs-sidebar-head">
        <Link to="/api-docs" className="api-docs-sidebar-home">
          <i className="fa-solid fa-code" />
          <span>API Reference</span>
        </Link>
        <Link to="/wiki" className="api-docs-sidebar-wiki">
          <i className="fa-solid fa-book-open" />
          Wiki
        </Link>
      </div>
      <nav className="api-docs-sidebar-nav">
        {apiDocsGroups.map((group) => {
          const pages = apiDocsPages.filter((page) => page.group === group);
          return (
            <div key={group} className="api-docs-sidebar-group">
              <div className="api-docs-sidebar-group-title">{group}</div>
              <ul className="api-docs-sidebar-list">
                {pages.map((page) => {
                  const active = page.slug === activeSlug || (page.isHome && !activeSlug);
                  return (
                    <li key={page.slug}>
                      <Link
                        to={apiDocsHref(page.slug)}
                        className={`api-docs-sidebar-link${active ? " is-active" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        {page.title}
                        {page.interactive ? (
                          <span className="api-docs-sidebar-badge">Try it</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
