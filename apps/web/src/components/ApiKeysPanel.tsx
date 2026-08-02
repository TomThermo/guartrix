import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApiKeyRecord, McServer } from "@msm/shared";
import { API_KEY_PRESETS, PERMISSION_GROUPS } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Card,
  Form,
  ListGroup,
  Spinner,
} from "react-bootstrap";
import { api } from "../api";
import { copyText } from "../utils";

export function ApiKeysPanel({ onError }: { onError?: (msg: string | null) => void }) {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [maxKeys, setMaxKeys] = useState(10);
  const [servers, setServers] = useState<McServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState(API_KEY_PRESETS[0]?.id ?? "read");
  const [customPerms, setCustomPerms] = useState<string[]>([]);
  const [restrictServers, setRestrictServers] = useState(false);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [list, serverList] = await Promise.all([
      api.listApiKeys(),
      api.listServers().catch(() => [] as McServer[]),
    ]);
    setKeys(list.keys);
    setMaxKeys(list.maxKeys);
    setServers(serverList);
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) =>
        onError?.(err instanceof Error ? err.message : "Failed to load API keys"),
      )
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  const activeCount = keys.filter((k) => !k.revokedAt).length;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError?.(null);
    setNotice(null);
    setNewToken(null);
    try {
      const presetMeta = API_KEY_PRESETS.find((p) => p.id === preset);
      const permissions =
        preset === "custom"
          ? customPerms
          : [...(presetMeta?.permissions ?? ["*"])];
      if (preset === "custom" && permissions.length === 0) {
        onError?.("Select at least one permission");
        setBusy(false);
        return;
      }
      const result = await api.createApiKey({
        name: name.trim(),
        permissions,
        serverIds: restrictServers ? selectedServers : null,
      });
      setNewToken(result.token);
      setName("");
      setCreating(false);
      setNotice("API key created — copy the token now; it will not be shown again.");
      await refresh();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(key: ApiKeyRecord) {
    if (
      !confirm(
        `Revoke API key "${key.name}" (${key.prefix}…)? Scripts using it will stop working immediately.`,
      )
    ) {
      return;
    }
    setBusy(true);
    onError?.(null);
    try {
      await api.revokeApiKey(key.id);
      setNotice(`Revoked ${key.name}.`);
      await refresh();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  function copyToken() {
    if (!newToken) return;
    void copyText(newToken).then(
      () => setNotice("Token copied to clipboard."),
      () => undefined,
    );
  }

  function toggleServer(id: string) {
    setSelectedServers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <Card.Body className="text-center py-4">
          <Spinner animation="border" size="sm" />
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <Card.Body>
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <h2 className="h6 mb-1">API keys</h2>
            <p className="text-secondary small mb-0">
              Bearer tokens for scripts and automation. Same server permissions as
              subusers. {activeCount}/{maxKeys} active.
            </p>
          </div>
          {!creating && activeCount < maxKeys && (
            <Button
              size="sm"
              variant="outline-primary"
              onClick={() => {
                setCreating(true);
                setNewToken(null);
                setNotice(null);
              }}
            >
              <i className="fa-solid fa-plus me-1" />
              New key
            </Button>
          )}
        </div>

        {notice && (
          <Alert
            variant="success"
            className="py-2"
            dismissible
            onClose={() => setNotice(null)}
          >
            {notice}
          </Alert>
        )}

        {newToken && (
          <Alert variant="warning" className="small">
            <div className="fw-semibold mb-2">Copy this token now</div>
            <code className="user-select-all d-block text-break mb-2">{newToken}</code>
            <Button size="sm" variant="outline-secondary" onClick={copyToken}>
              Copy token
            </Button>
          </Alert>
        )}

        {creating && (
          <Form onSubmit={onCreate} className="border rounded p-3 mb-3">
            <Form.Group className="mb-3" controlId="key-name">
              <Form.Label>Name</Form.Label>
              <Form.Control
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="CI deploy"
                maxLength={64}
                required
                autoFocus
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="key-preset">
              <Form.Label>Permissions</Form.Label>
              <Form.Select
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value);
                  if (e.target.value !== "custom") setCustomPerms([]);
                }}
              >
                {API_KEY_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </Form.Select>
              <Form.Text className="text-secondary">
                {preset === "custom"
                  ? "Pick individual scopes below."
                  : API_KEY_PRESETS.find((p) => p.id === preset)?.description}
              </Form.Text>
            </Form.Group>
            {preset === "custom" && (
              <div
                className="mb-3 small border rounded p-2"
                style={{ maxHeight: 220, overflow: "auto" }}
              >
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.id} className="mb-2">
                    <div className="fw-semibold mb-1">{group.label}</div>
                    {group.permissions.map((perm) => (
                      <Form.Check
                        key={perm.key}
                        type="checkbox"
                        id={`perm-${perm.key}`}
                        className="mb-1"
                        label={perm.label}
                        checked={customPerms.includes(perm.key)}
                        onChange={() =>
                          setCustomPerms((prev) =>
                            prev.includes(perm.key)
                              ? prev.filter((x) => x !== perm.key)
                              : [...prev, perm.key],
                          )
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
            <Form.Check
              className="mb-2"
              type="checkbox"
              id="restrict-servers"
              label="Limit to specific servers"
              checked={restrictServers}
              onChange={(e) => setRestrictServers(e.target.checked)}
            />
            {restrictServers && (
              <div className="mb-3 small border rounded p-2" style={{ maxHeight: 160, overflow: "auto" }}>
                {servers.length === 0 ? (
                  <span className="text-secondary">No servers available.</span>
                ) : (
                  servers.map((s) => (
                    <Form.Check
                      key={s.id}
                      type="checkbox"
                      id={`srv-${s.id}`}
                      label={`${s.name} (${s.id})`}
                      checked={selectedServers.includes(s.id)}
                      onChange={() => toggleServer(s.id)}
                    />
                  ))
                )}
              </div>
            )}
            <div className="d-flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="primary"
                disabled={
                  busy ||
                  !name.trim() ||
                  (restrictServers && selectedServers.length === 0)
                }
              >
                {busy ? "Creating…" : "Create key"}
              </Button>
              <Button
                type="button"
                variant="outline-secondary"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
            </div>
          </Form>
        )}

        {keys.length === 0 ? (
          <p className="text-secondary small mb-0">No API keys yet.</p>
        ) : (
          <ListGroup variant="flush">
            {keys.map((k) => (
              <ListGroup.Item
                key={k.id}
                className="d-flex justify-content-between align-items-start gap-2 px-0"
              >
                <div className="min-w-0">
                  <div className="fw-semibold">
                    {k.name}{" "}
                    {k.revokedAt ? (
                      <Badge bg="secondary">Revoked</Badge>
                    ) : (
                      <Badge bg="success">Active</Badge>
                    )}
                  </div>
                  <div className="small text-secondary font-monospace">{k.prefix}…</div>
                  <div className="small text-secondary">
                    {k.permissions.includes("*")
                      ? "Full access"
                      : `${k.permissions.length} permission${k.permissions.length === 1 ? "" : "s"}`}
                    {k.serverIds
                      ? ` · ${k.serverIds.length} server${k.serverIds.length === 1 ? "" : "s"}`
                      : " · all servers"}
                    {" · "}
                    created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt &&
                      ` · last used ${new Date(k.lastUsedAt).toLocaleString()}`}
                  </div>
                </div>
                {!k.revokedAt && (
                  <Button
                    size="sm"
                    variant="outline-danger"
                    disabled={busy}
                    onClick={() => void onRevoke(k)}
                  >
                    Revoke
                  </Button>
                )}
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  );
}
