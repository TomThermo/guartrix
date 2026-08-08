import { Link } from "react-router-dom";
import { wikiArticles, wikiCategories } from "../../wiki/wiki-content";

export function WikiSidebar({ activeSlug }: { activeSlug?: string }) {
  return (
    <aside className="wiki-sidebar" aria-label="Wiki topics">
      <div className="wiki-sidebar-head">
        <Link to="/wiki" className="wiki-sidebar-home">
          <i className="fa-solid fa-book-open" />
          <span>Wiki overview</span>
        </Link>
      </div>
      <nav className="wiki-sidebar-nav">
        {wikiCategories.map((category) => {
          const articles = wikiArticles.filter((article) => article.category === category);
          return (
            <div key={category} className="wiki-sidebar-group">
              <div className="wiki-sidebar-group-title">{category}</div>
              <ul className="wiki-sidebar-list">
                {articles.map((article) => {
                  const active = article.slug === activeSlug;
                  return (
                    <li key={article.slug}>
                      <Link
                        to={`/wiki/${article.slug}`}
                        className={`wiki-sidebar-link${active ? " is-active" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        {article.title}
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
