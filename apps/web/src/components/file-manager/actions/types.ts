export type Dialog =
  | {
      kind: "confirm";
      title: string;
      body: string;
      confirmLabel?: string;
      variant?: "danger" | "primary" | "warning";
      onYes: () => void | Promise<void>;
    }
  | {
      kind: "prompt";
      title: string;
      label: string;
      defaultValue: string;
      confirmLabel?: string;
      onYes: (v: string) => void | Promise<void>;
    }
  | null;

export interface EditorTab {
  path: string;
  content: string;
  dirty: boolean;
}

export type PaneMode = "browser" | "editor";

export const TREE_WIDTH_KEY = "guartrix-fm-tree-width";
export const TREE_COLLAPSED_KEY = "guartrix-fm-tree-collapsed";
export const DEFAULT_TREE_WIDTH = 240;
export const MIN_TREE_WIDTH = 160;
export const MAX_TREE_WIDTH = 420;

export interface FileManagerActionsProps {
  serverId: string;
  onError: (message: string | null) => void;
  diskMb?: number;
  active?: boolean;
  canReadContent?: boolean;
  canUpdate?: boolean;
  canCreate?: boolean;
  canUpload?: boolean;
  canDelete?: boolean;
  canDownload?: boolean;
  canArchive?: boolean;
}
