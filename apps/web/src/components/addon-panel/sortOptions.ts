import type { AddonSortIndex } from "@guartrix/shared";

export const ADDON_SORT_OPTIONS: { value: AddonSortIndex; labelKey: string }[] = [
  { value: "relevance", labelKey: "addons.sortRelevance" },
  { value: "downloads", labelKey: "addons.sortDownloads" },
  { value: "follows", labelKey: "addons.sortFollows" },
  { value: "newest", labelKey: "addons.sortNewest" },
  { value: "updated", labelKey: "addons.sortUpdated" },
];
