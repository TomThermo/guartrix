import { useState } from "react";
import { api } from "../../../api";
import type { MessageKey, TranslateParams } from "../../../i18n";
import type { EditorTab, PaneMode } from "./types";

type Translate = (key: MessageKey | string, params?: TranslateParams) => string;

export function useFileEditorState({
  serverId,
  onError,
  t,
  canUpdate,
  askDiscard,
  setBusy,
}: {
  serverId: string;
  onError: (message: string | null) => void;
  t: Translate;
  canUpdate: boolean;
  askDiscard: (onYes: () => void | Promise<void>) => void;
  setBusy: (busy: boolean) => void;
}) {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [paneMode, setPaneMode] = useState<PaneMode>("browser");

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;
  const anyDirty = tabs.some((tab) => tab.dirty);
  const showEditor = paneMode === "editor" && activeTab !== null;

  async function openFileAtPath(path: string) {
    const existing = tabs.find((tab) => tab.path === path);
    if (existing) {
      setActivePath(path);
      setPaneMode("editor");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      const data = await api.readFile(serverId, path);
      setTabs((prev) => [...prev, { path: data.path, content: data.content, dirty: false }]);
      setActivePath(data.path);
      setPaneMode("editor");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("files.openFailed"));
    } finally {
      setBusy(false);
    }
  }

  function updateActiveContent(content: string) {
    if (!activePath) return;
    setTabs((prev) =>
      prev.map((tab) => (tab.path === activePath ? { ...tab, content, dirty: true } : tab)),
    );
  }

  async function saveFile() {
    if (!activeTab || !canUpdate) return;
    setBusy(true);
    onError(null);
    try {
      await api.writeFile(serverId, activeTab.path, activeTab.content);
      setTabs((prev) =>
        prev.map((tab) => (tab.path === activeTab.path ? { ...tab, dirty: false } : tab)),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : t("files.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function closeTab(path: string) {
    const tab = tabs.find((t) => t.path === path);
    const doClose = () => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.path !== path);
        if (activePath === path) {
          const idx = prev.findIndex((t) => t.path === path);
          const fallback = next[Math.max(0, idx - 1)] ?? next[0] ?? null;
          setActivePath(fallback?.path ?? null);
          if (!fallback) setPaneMode("browser");
        }
        return next;
      });
    };
    if (tab?.dirty) {
      askDiscard(doClose);
      return;
    }
    doClose();
  }

  return {
    tabs,
    setTabs,
    activePath,
    setActivePath,
    paneMode,
    setPaneMode,
    activeTab,
    anyDirty,
    showEditor,
    openFileAtPath,
    updateActiveContent,
    saveFile,
    closeTab,
  };
}
