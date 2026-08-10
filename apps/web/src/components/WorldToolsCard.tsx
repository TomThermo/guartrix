import { useState } from "react";
import type { McServer } from "@guartrix/shared";
import { Alert, Button, Form, Spinner, Stack } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  server: McServer;
  canEdit: boolean;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}

export function WorldToolsCard({ server, canEdit, onNotice, onError }: Props) {
  const { t } = useI18n();
  const [dims, setDims] = useState({
    overworld: true,
    nether: true,
    end: true,
  });
  const [busy, setBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  const running =
    server.status === "RUNNING" || server.status === "STARTING" || server.status === "STOPPING";

  async function reset() {
    const dimensions = (Object.entries(dims) as Array<[keyof typeof dims, boolean]>)
      .filter(([, on]) => on)
      .map(([k]) => k);
    if (!dimensions.length) {
      onError(t("worldTools.selectDimension"));
      return;
    }
    if (
      !confirm(
        t("worldTools.resetConfirm", {
          dimensions: dimensions.join(", "),
          name: server.name,
        }),
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.resetWorld(server.id, {
        dimensions,
        regenerate: true,
      });
      onNotice(
        t("worldTools.resetNotice", {
          deleted: result.deleted.join(", ") || "nothing",
          levelName: result.levelName,
        }),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : t("worldTools.resetFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onImport(file: File | null) {
    if (!file) return;
    if (!confirm(t("worldTools.importConfirm", { file: file.name }))) {
      return;
    }
    setImportBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await api.importWorld(server.id, file);
      onNotice(t("worldTools.importNotice", { levelName: result.levelName }));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("worldTools.importFailed"));
    } finally {
      setImportBusy(false);
    }
  }

  if (!canEdit) return null;

  return (
    <Alert variant="light" className="border mt-3 mb-0">
      <div className="fw-semibold mb-2">
        <i className="fa-solid fa-earth-americas me-2" />
        {t("worldTools.title")}
      </div>
      <p className="small text-secondary mb-2">{t("worldTools.help")}</p>
      {running && <div className="small text-muted mb-2">{t("worldTools.stopFirst")}</div>}
      <Stack direction="horizontal" gap={3} className="flex-wrap mb-2">
        {(["overworld", "nether", "end"] as const).map((d) => (
          <Form.Check
            key={d}
            type="checkbox"
            id={`world-dim-${d}`}
            label={d}
            checked={dims[d]}
            disabled={busy || running}
            onChange={(e) => setDims((prev) => ({ ...prev, [d]: e.target.checked }))}
          />
        ))}
      </Stack>
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        <Button
          size="sm"
          variant="outline-danger"
          disabled={busy || running}
          onClick={() => void reset()}
        >
          {busy ? <Spinner size="sm" /> : t("worldTools.resetSelected")}
        </Button>
        <Form.Control
          type="file"
          size="sm"
          accept=".zip,application/zip"
          disabled={importBusy || running}
          style={{ maxWidth: 260 }}
          onChange={(e) => {
            const input = e.target as HTMLInputElement;
            const file = input.files?.[0] ?? null;
            input.value = "";
            void onImport(file);
          }}
        />
        {importBusy && <Spinner size="sm" />}
      </Stack>
    </Alert>
  );
}
