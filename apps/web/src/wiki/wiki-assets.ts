const wikiAssetUrls = import.meta.glob("../../../../docs/wiki/assets/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export function wikiAsset(name: string): string {
  return wikiAssetUrls[`../../../../docs/wiki/assets/${name}`] ?? "";
}
