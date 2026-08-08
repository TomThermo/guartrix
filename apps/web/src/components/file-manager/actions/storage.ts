import {
  DEFAULT_TREE_WIDTH,
  MAX_TREE_WIDTH,
  MIN_TREE_WIDTH,
  TREE_COLLAPSED_KEY,
  TREE_WIDTH_KEY,
} from "./types";

export function readStoredWidth(): number {
  try {
    const n = Number(localStorage.getItem(TREE_WIDTH_KEY));
    if (Number.isFinite(n) && n >= MIN_TREE_WIDTH && n <= MAX_TREE_WIDTH) return n;
  } catch {
    /* ignore */
  }
  return DEFAULT_TREE_WIDTH;
}

export function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(TREE_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}
