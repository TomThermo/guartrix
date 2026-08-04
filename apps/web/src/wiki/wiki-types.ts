export type WikiSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type WikiArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  keywords: string[];
  sourcePath?: string;
  relatedSlugs?: string[];
  sections: WikiSection[];
};
