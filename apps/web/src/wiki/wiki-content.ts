import type { WikiArticle } from "./wiki-types";
import { overviewArticles } from "./articles/overview";
import { internalsArticles } from "./articles/internals";
import { usingPanelArticles } from "./articles/using-panel";
import { operationsArticles } from "./articles/operations";
import { gettingStartedArticles } from "./articles/getting-started";
import { wikiMarkdownForSource } from "./wiki-md";

function attachMarkdown(articles: WikiArticle[]): WikiArticle[] {
  return articles.map((article) => {
    const markdown = wikiMarkdownForSource(article.sourcePath) ?? article.markdown;
    if (!markdown?.trim()) return article;
    return { ...article, markdown, sections: [] };
  });
}

export const wikiArticles: WikiArticle[] = attachMarkdown([
  ...overviewArticles,
  ...internalsArticles,
  ...usingPanelArticles,
  ...operationsArticles,
  ...gettingStartedArticles,
]);

export const wikiArticlesBySlug = new Map(wikiArticles.map((article) => [article.slug, article]));

export const wikiCategories = Array.from(new Set(wikiArticles.map((article) => article.category)));

function articleSearchText(article: WikiArticle): string {
  const sectionText = article.sections
    .flatMap((section) => [
      section.title,
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
      ...(section.code ?? []).flatMap((block) => [block.label ?? "", block.content]),
    ])
    .join(" ");
  return [
    article.title,
    article.summary,
    article.category,
    article.keywords.join(" "),
    sectionText,
    article.markdown ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function searchWikiArticles(query: string, category?: string): WikiArticle[] {
  const normalizedQuery = query.trim().toLowerCase();
  return wikiArticles.filter((article) => {
    if (category && category !== "All" && article.category !== category) return false;
    if (!normalizedQuery) return true;
    return articleSearchText(article).includes(normalizedQuery);
  });
}
