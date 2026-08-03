import { useCallback, useEffect, useState } from "react";
import type { McServer } from "@msm/shared";
import { Alert, Button, Form, Spinner, Stack } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface EngineField {
  id: string;
  file: string;
  label: string;
  hint?: string;
  type: "boolean" | "number" | "string";
  value: boolean | number | string | null;
  present: boolean;
}

interface Props {
  server: McServer;
  canUpdate: boolean;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}

export function EngineSettingsPanel({
  server,
  canUpdate,
  onNotice,
  onError,
}: Props) {
  const { t } = useI18n();
  const [fields, setFields] = useState<EngineField[]>([]);
  const [supported, setSupported] = useState(false);
  const [draft, setDraft] = useState<Record<string, boolean | number | string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getEngineSettings(server.id);
      setSupported(res.supported);
      setFields(res.fields);
      const next: Record<string, boolean | number | string> = {};
      for (const f of res.fields) {
        if (f.value != null) next[f.id] = f.value;
      }
      setDraft(next);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load engine settings");
    } finally {
      setLoading(false);
    }
  }, [server.id, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    onError(null);
    onNotice(null);
    try {
      const res = await api.updateEngineSettings(server.id, draft);
      setFields(res.fields);
      onNotice("Engine settings saved. Restart the server to apply.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-4">
        <Spinner />
      </div>
    );
  }

  if (!supported) {
    return (
      <Alert variant="light" className="border">
        Guided engine settings are available for Paper and Purpur. For Fabric/Forge,
        edit files under <code>config/</code> in the File Manager.
      </Alert>
    );
  }

  return (
    <div>
      <h2 className="h5 mb-2">{t("engine.title")}</h2>
      <p className="text-secondary small">
        Common Paper/Spigot/Purpur toggles. Advanced options: open the YAML in File
        Manager.
      </p>
      <Stack gap={3} className="mb-3">
        {fields.map((f) => (
          <Form.Group key={f.id} controlId={`engine-${f.id}`}>
            <Form.Label className="mb-1">
              {f.label}
              {!f.present && (
                <span className="text-muted small ms-2">(file missing until first start)</span>
              )}
            </Form.Label>
            {f.hint && <Form.Text className="d-block mb-1">{f.hint}</Form.Text>}
            {f.type === "boolean" ? (
              <Form.Check
                type="switch"
                checked={Boolean(draft[f.id])}
                disabled={!canUpdate}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.id]: e.target.checked }))
                }
              />
            ) : (
              <Form.Control
                type={f.type === "number" ? "number" : "text"}
                value={
                  draft[f.id] === undefined || draft[f.id] === null
                    ? ""
                    : String(draft[f.id])
                }
                disabled={!canUpdate}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [f.id]:
                      f.type === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                  }))
                }
              />
            )}
            <Form.Text className="text-muted">{f.file}</Form.Text>
          </Form.Group>
        ))}
      </Stack>
      {canUpdate && (
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? <Spinner size="sm" /> : t("engine.save")}
        </Button>
      )}
    </div>
  );
}
