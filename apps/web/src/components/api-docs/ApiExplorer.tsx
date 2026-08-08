import { useEffect, useMemo, useState } from "react";
import {
  API_ENDPOINT_DEMOS,
  API_LANGS,
  demoGroups,
  generateSnippet,
  type ApiEndpointDemo,
  type ApiLang,
  type HttpMethod,
} from "../../api-docs/api-explorer-catalog";

const STORE_KEY = "guartrix.wiki.apiExplorer.v1";

type StoredPrefs = {
  panel?: string;
  token?: string;
  serverId?: string;
  lang?: ApiLang;
  endpointId?: string;
};

function loadPrefs(): StoredPrefs {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredPrefs;
  } catch {
    return {};
  }
}

function savePrefs(prefs: StoredPrefs) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

function methodClass(method: HttpMethod): string {
  return `api-ex-method api-ex-method--${method.toLowerCase()}`;
}

type RunState =
  | { status: "idle" }
  | { status: "running" }
  | {
      status: "done";
      httpStatus: number;
      ok: boolean;
      ms: number;
      bodyText: string;
      truncated: boolean;
    }
  | { status: "error"; message: string };

const MAX_BODY = 200_000;

export function ApiExplorer() {
  const prefs = useMemo(() => loadPrefs(), []);
  const [panel, setPanel] = useState(
    () =>
      prefs.panel ||
      (typeof window !== "undefined" ? window.location.origin : "https://guartrix.com"),
  );
  const [token, setToken] = useState(() => prefs.token || "");
  const [serverId, setServerId] = useState(() => prefs.serverId || "");
  const [lang, setLang] = useState<ApiLang>(() => prefs.lang || "curl");
  const [endpointId, setEndpointId] = useState(() => prefs.endpointId || API_ENDPOINT_DEMOS[0]!.id);
  const [bodyEdit, setBodyEdit] = useState("");
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  const endpoint = API_ENDPOINT_DEMOS.find((d) => d.id === endpointId) ?? API_ENDPOINT_DEMOS[0]!;
  const groups = demoGroups();

  useEffect(() => {
    savePrefs({ panel, token, serverId, lang, endpointId });
  }, [panel, token, serverId, lang, endpointId]);

  useEffect(() => {
    setBodyEdit(endpoint.body !== undefined ? JSON.stringify(endpoint.body, null, 2) : "");
    setRun({ status: "idle" });
  }, [endpoint.body]);

  const parsedBody = useMemo(() => {
    if (!bodyEdit.trim()) return { ok: true as const, value: undefined as unknown };
    try {
      return { ok: true as const, value: JSON.parse(bodyEdit) as unknown };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Invalid JSON",
      };
    }
  }, [bodyEdit]);

  const snippet = useMemo(() => {
    const body =
      endpoint.method === "GET" || endpoint.method === "DELETE"
        ? undefined
        : parsedBody.ok
          ? parsedBody.value
          : endpoint.body;
    return generateSnippet(lang, {
      panel,
      token,
      serverId,
      method: endpoint.method,
      path: endpoint.path,
      query: endpoint.query,
      body,
      auth: endpoint.auth,
    });
  }, [lang, panel, token, serverId, endpoint, parsedBody]);

  async function runRequest() {
    if (endpoint.auth !== "none" && !token.trim()) {
      setRun({
        status: "error",
        message:
          endpoint.auth === "gta"
            ? "Paste an Application API key (gta_…) to run this request."
            : "Paste a Client API key (gt_…) to run this request.",
      });
      return;
    }
    if (endpoint.path.includes("{serverId}") && !serverId.trim()) {
      setRun({ status: "error", message: "Enter a server ID first." });
      return;
    }
    if (
      endpoint.method !== "GET" &&
      endpoint.method !== "DELETE" &&
      bodyEdit.trim() &&
      !parsedBody.ok
    ) {
      setRun({ status: "error", message: `Request body JSON: ${parsedBody.error}` });
      return;
    }

    const path = endpoint.path.replaceAll("{serverId}", serverId.trim());
    const q = endpoint.query ? `?${endpoint.query}` : "";
    const url = `${panel.replace(/\/$/, "")}${path}${q}`;
    const headers: Record<string, string> = {};
    if (endpoint.auth === "gt" || endpoint.auth === "gta") {
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    const init: RequestInit = { method: endpoint.method, headers };
    if (endpoint.method !== "GET" && endpoint.method !== "DELETE") {
      headers["Content-Type"] = "application/json";
      init.body = bodyEdit.trim() || "{}";
    }

    setRun({ status: "running" });
    const t0 = performance.now();
    try {
      const res = await fetch(url, init);
      const ms = Math.round(performance.now() - t0);
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // keep raw
      }
      const truncated = pretty.length > MAX_BODY;
      setRun({
        status: "done",
        httpStatus: res.status,
        ok: res.ok,
        ms,
        bodyText: truncated ? `${pretty.slice(0, MAX_BODY)}\n… (truncated)` : pretty,
        truncated,
      });
    } catch (err) {
      setRun({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="api-ex">
      <div className="api-ex-intro">
        <p>
          Stripe-style explorer: pick an endpoint, switch language, copy the snippet, or{" "}
          <strong>run it live</strong> against this panel. Keys stay in <code>sessionStorage</code>{" "}
          on this browser only — never embedded in docs.
        </p>
      </div>

      <div className="api-ex-config">
        <label className="api-ex-field">
          <span>Panel base URL</span>
          <input
            className="form-control"
            value={panel}
            onChange={(e) => setPanel(e.target.value)}
            placeholder="https://guartrix.com"
            spellCheck={false}
          />
        </label>
        <label className="api-ex-field">
          <span>API key (gt_… or gta_…)</span>
          <input
            className="form-control"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste key — shown once at create time"
            spellCheck={false}
          />
        </label>
        <label className="api-ex-field">
          <span>Server ID</span>
          <input
            className="form-control"
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
            placeholder="from GET /api/servers"
            spellCheck={false}
          />
        </label>
      </div>

      <div className="api-ex-layout">
        <aside className="api-ex-nav" aria-label="API endpoints">
          {groups.map((group) => (
            <div key={group} className="api-ex-nav-group">
              <div className="api-ex-nav-title">{group}</div>
              <ul>
                {API_ENDPOINT_DEMOS.filter((d) => d.group === group).map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`api-ex-nav-item${d.id === endpoint.id ? " is-active" : ""}`}
                      onClick={() => setEndpointId(d.id)}
                    >
                      <span className={methodClass(d.method)}>{d.method}</span>
                      <span className="api-ex-nav-label">{d.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <div className="api-ex-main">
          <header className="api-ex-endpoint-head">
            <div className="api-ex-endpoint-title">
              <span className={methodClass(endpoint.method)}>{endpoint.method}</span>
              <code className="api-ex-path">
                {endpoint.path}
                {endpoint.query ? `?${endpoint.query}` : ""}
              </code>
            </div>
            <p className="api-ex-desc">{endpoint.description}</p>
            <div className="api-ex-meta">
              <span className="api-ex-chip">
                Auth:{" "}
                {endpoint.auth === "none"
                  ? "none"
                  : endpoint.auth === "gta"
                    ? "Bearer gta_"
                    : endpoint.auth === "gt"
                      ? "Bearer gt_"
                      : "session"}
              </span>
              <span className={`api-ex-chip${endpoint.safe ? "" : " is-warn"}`}>
                {endpoint.safe ? "Safe to try" : "Mutating — use carefully"}
              </span>
            </div>
          </header>

          {(endpoint.method === "POST" ||
            endpoint.method === "PUT" ||
            endpoint.method === "PATCH") && (
            <label className="api-ex-field api-ex-body-field">
              <span>Request body (JSON)</span>
              <textarea
                className="form-control api-ex-body"
                rows={8}
                value={bodyEdit}
                onChange={(e) => setBodyEdit(e.target.value)}
                spellCheck={false}
              />
              {!parsedBody.ok && <span className="api-ex-error-inline">{parsedBody.error}</span>}
            </label>
          )}

          <div className="api-ex-code-panel">
            <div className="api-ex-lang-bar" role="tablist" aria-label="Example language">
              {API_LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={lang === l.id}
                  className={`api-ex-lang${lang === l.id ? " is-active" : ""}`}
                  onClick={() => setLang(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="api-ex-code-actions">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={copySnippet}
              >
                <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"} me-1`} />
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-success"
                onClick={() => void runRequest()}
                disabled={run.status === "running"}
              >
                <i className="fa-solid fa-play me-1" />
                {run.status === "running" ? "Running…" : "Try it"}
              </button>
            </div>
            <pre className="api-ex-code">
              <code>{snippet}</code>
            </pre>
          </div>

          <div className="api-ex-response">
            <div className="api-ex-response-head">
              <h3>Response</h3>
              {run.status === "done" && (
                <span className={`api-ex-status${run.ok ? " is-ok" : " is-bad"}`}>
                  {run.httpStatus} · {run.ms} ms
                </span>
              )}
            </div>
            {run.status === "idle" && (
              <p className="api-ex-response-placeholder">
                Click <strong>Try it</strong> to send this request from your browser.
                {endpoint.sampleResponse != null && (
                  <>
                    {" "}
                    Sample:
                    <pre className="api-ex-sample">
                      <code>{JSON.stringify(endpoint.sampleResponse, null, 2)}</code>
                    </pre>
                  </>
                )}
              </p>
            )}
            {run.status === "running" && (
              <p className="api-ex-response-placeholder">Waiting for response…</p>
            )}
            {run.status === "error" && <p className="api-ex-error">{run.message}</p>}
            {run.status === "done" && (
              <pre className="api-ex-response-body">
                <code>{run.bodyText || "(empty body)"}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Keep type export for future per-endpoint deep links. */
export type { ApiEndpointDemo };
