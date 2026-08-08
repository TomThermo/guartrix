import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApiKeyRecord, McServer } from "@msm/shared";
import { API_KEY_PRESETS, PERMISSION_GROUPS } from "@msm/shared";
import { Alert, Badge, Button, Card, Form, ListGroup, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { copyText } from "../utils";

export function ApiKeysPanel({
  onError,
  embedded = false,
}: {
  onError?: (msg: string | null) => void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
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
      .catch((err) => onError?.(err instanceof Error ? err.message : t("apiKeys.loadFailed")))
      .finally(() => setLoading(false));
  }, [refresh, onError, t]);

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
        preset === "custom" ? customPerms : [...(presetMeta?.permissions ?? ["*"])];
      if (preset === "custom" && permissions.length === 0) {
        onError?.(t("apiKeys.selectPermission"));
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
      setNotice(t("apiKeys.createdNotice"));
      await refresh();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : t("apiKeys.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(key: ApiKeyRecord) {
    if (!confirm(t("apiKeys.revokeConfirm", { name: key.name, prefix: key.prefix }))) {
      return;
    }
    setBusy(true);
    onError?.(null);
    try {
      await api.revokeApiKey(key.id);
      setNotice(t("apiKeys.revokedNotice", { name: key.name }));
      await refresh();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : t("apiKeys.revokeFailed"));
    } finally {
      setBusy(false);
    }
  }

  function copyToken() {
    if (!newToken) return;
    void copyText(newToken).then(
      () => setNotice(t("apiKeys.tokenCopied")),
      () => undefined,
    );
  }

  function toggleServer(id: string) {
    setSelectedServers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  if (loading) {
    const loadingBody = (
      <div className="text-center py-4">
        <Spinner animation="border" size="sm" />
      </div>
    );
    if (embedded) return loadingBody;
    return (
      <Card className="border-0 shadow-sm">
        <Card.Body>{loadingBody}</Card.Body>
      </Card>
    );
  }

  const body = (
    <>
      {!embedded && (
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <h2 className="h6 mb-1">{t("apiKeys.title")}</h2>
            <p className="text-secondary small mb-0">
              {t("apiKeys.subtitle", { active: activeCount, max: maxKeys })}
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
              {t("apiKeys.newKey")}
            </Button>
          )}
        </div>
      )}

      {embedded && (
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <p className="text-secondary small mb-0">
            {t("apiKeys.subtitle", { active: activeCount, max: maxKeys })}
          </p>
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
              {t("apiKeys.newKey")}
            </Button>
          )}
        </div>
      )}

      {notice && (
        <Alert variant="success" className="py-2" dismissible onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {newToken && (
        <Alert variant="warning" className="small">
          <div className="fw-semibold mb-2">{t("apiKeys.copyTokenNow")}</div>
          <code className="user-select-all d-block text-break mb-2">{newToken}</code>
          <Button size="sm" variant="outline-secondary" onClick={copyToken}>
            {t("apiKeys.copyToken")}
          </Button>
        </Alert>
      )}

      {creating && (
        <Form
          onSubmit={onCreate}
          className={embedded ? "admin-inset-card p-3 mb-3" : "border rounded p-3 mb-3"}
        >
          <Form.Group className="mb-3" controlId="key-name">
            <Form.Label>{t("common.name")}</Form.Label>
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
            <Form.Label>{t("apiKeys.permissions")}</Form.Label>
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
              <option value="custom">{t("apiKeys.custom")}</option>
            </Form.Select>
            <Form.Text className="text-secondary">
              {preset === "custom"
                ? t("apiKeys.customHelp")
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
            label={t("apiKeys.limitServers")}
            checked={restrictServers}
            onChange={(e) => setRestrictServers(e.target.checked)}
          />
          {restrictServers && (
            <div
              className="mb-3 small border rounded p-2"
              style={{ maxHeight: 160, overflow: "auto" }}
            >
              {servers.length === 0 ? (
                <span className="text-secondary">{t("apiKeys.noServers")}</span>
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
              disabled={busy || !name.trim() || (restrictServers && selectedServers.length === 0)}
            >
              {busy ? t("common.creating") : t("apiKeys.createKey")}
            </Button>
            <Button
              type="button"
              variant="outline-secondary"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </Form>
      )}

      {keys.length === 0 ? (
        <p className="text-secondary small mb-0">{t("apiKeys.empty")}</p>
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
                    <Badge bg="secondary">{t("apiKeys.revoked")}</Badge>
                  ) : (
                    <Badge bg="success">{t("apiKeys.active")}</Badge>
                  )}
                </div>
                <div className="small text-secondary font-monospace">{k.prefix}…</div>
                <div className="small text-secondary">
                  {k.permissions.includes("*")
                    ? t("apiKeys.fullAccess")
                    : k.permissions.length === 1
                      ? t("apiKeys.permissionOne", { count: k.permissions.length })
                      : t("apiKeys.permissionMany", { count: k.permissions.length })}
                  {k.serverIds
                    ? k.serverIds.length === 1
                      ? ` · ${t("apiKeys.serverOne", { count: k.serverIds.length })}`
                      : ` · ${t("apiKeys.serverMany", { count: k.serverIds.length })}`
                    : ` · ${t("apiKeys.allServers")}`}
                  {" · "}
                  {t("apiKeys.created", {
                    date: new Date(k.createdAt).toLocaleDateString(),
                  })}
                  {k.lastUsedAt &&
                    ` · ${t("apiKeys.lastUsed", {
                      date: new Date(k.lastUsedAt).toLocaleString(),
                    })}`}
                </div>
              </div>
              {!k.revokedAt && (
                <Button
                  size="sm"
                  variant="outline-danger"
                  disabled={busy}
                  onClick={() => void onRevoke(k)}
                >
                  {t("apiKeys.revoke")}
                </Button>
              )}
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </>
  );

  if (embedded) return body;

  return (
    <Card className="border-0 shadow-sm">
      <Card.Body>{body}</Card.Body>
    </Card>
  );
}
