interface EditorTab {
  path: string;
  dirty: boolean;
}

interface Props {
  tabs: EditorTab[];
  activePath: string | null;
  busy: boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function FileEditorTabs({ tabs, activePath, busy, onSelect, onClose }: Props) {
  if (!tabs.length) return null;

  return (
    <div className="file-editor-tabs" role="tablist">
      {tabs.map((tab) => {
        const name = tab.path.split("/").pop() || tab.path;
        const active = tab.path === activePath;
        return (
          <div
            key={tab.path}
            className={`file-editor-tab${active ? " is-active" : ""}`}
            role="tab"
            aria-selected={active}
            title={tab.path}
          >
            <button
              type="button"
              className="file-editor-tab-label"
              disabled={busy}
              onClick={() => onSelect(tab.path)}
            >
              {tab.dirty && <span className="file-editor-tab-dirty" aria-hidden />}
              <span className="text-truncate">{name}</span>
            </button>
            <button
              type="button"
              className="file-editor-tab-close"
              disabled={busy}
              aria-label={`Close ${name}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
