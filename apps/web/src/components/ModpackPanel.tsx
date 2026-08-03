import { useCallback, useEffect, useState } from "react";
import type { McServer } from "@msm/shared";
import { addonKindFor } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Form,
  Spinner,
  Stack,
  Table,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface Props {
  server: McServer;
  canUpdate: boolean;
  onNotice: (message: string | null) => void;
  onError: (message: string | null) => void;
}

type Source = "modrinth" | "curseforge";

export function ModpackPanel({
  server,
  canUpdate,
  onNotice,
  onError,
}: Props) {
  const { t } = useI18n();
  const [source, setSource] = useState<Source>("modrinth");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<Record<string, unknown>>>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  const kind = addonKindFor(server.type);
  const supports =
    server.type === "FABRIC" ||
    server.type === "QUILT" ||
    server.type === "FORGE" ||
    server.type === "NEOFORGE";

  const search = useCallback(async () => {
    if (!supports) return;
    setLoading(true);
    onError(null);
    try {
      const res = await api.searchModpacks(server.id, {
        q: query,
        source,
      });
      setHits(res.hits);
      setConfigured(res.configured !== false);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("modpacks.searchFailed"));
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, [server.id, query, source, supports, onError, t]);

  useEffect(() => {
    void search();
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps -- initial + source

  async function installHit(hit: Record<string, unknown>) {
    if (!canUpdate) return;
    const running =
      server.status === "RUNNING" || server.status === "STARTING";
    if (running) {
      onError(t("modpacks.stopFirst"));
      return;
    }
    const title = String(hit.title ?? hit.name ?? "modpack");
    if (!confirm(t("modpacks.confirmInstall", { title }))) {
      return;
    }
    setInstalling(title);
    onError(null);
    onNotice(null);
    try {
      if (source === "curseforge") {
        const modId = Number(hit.id);
        const result = await api.installModpack(server.id, {
          source: "curseforge",
          modId,
        });
        onNotice(
          t("modpacks.noticeInstalled", {
            title: result.title,
            version: result.versionNumber,
            count: result.filesInstalled,
          }),
        );
      } else {
        const projectId = String(hit.project_id ?? hit.slug ?? "");
        const result = await api.installModpack(server.id, {
          source: "modrinth",
          projectId,
        });
        onNotice(
          t("modpacks.noticeInstalled", {
            title: result.title,
            version: result.versionNumber,
            count: result.filesInstalled,
          }),
        );
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : t("addons.installFailed"));
    } finally {
      setInstalling(null);
    }
  }

  if (!supports || kind !== "mod") {
    return (
      <Alert variant="light" className="border">
        {t("modpacks.unsupported")}
      </Alert>
    );
  }

  return (
    <div>
      <h2 className="h5 mb-3">{t("modpacks.title")}</h2>
      <p className="text-secondary small">{t("modpacks.help")}</p>
      <Stack direction="horizontal" gap={2} className="flex-wrap mb-3">
        <Form.Select
          style={{ maxWidth: 160 }}
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
        >
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
        </Form.Select>
        <Form.Control
          style={{ maxWidth: 260 }}
          placeholder={t("modpacks.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search();
          }}
        />
        <Button
          variant="outline-secondary"
          disabled={loading}
          onClick={() => void search()}
        >
          {loading ? <Spinner size="sm" /> : t("common.search")}
        </Button>
      </Stack>

      {source === "curseforge" && !configured && (
        <Alert variant="warning">{t("modpacks.curseforgeMissing")}</Alert>
      )}

      {hits.length === 0 && !loading ? (
        <div className="text-secondary small">{t("modpacks.empty")}</div>
      ) : (
        <Table responsive hover size="sm" className="align-middle">
          <thead>
            <tr>
              <th>Pack</th>
              <th>Downloads</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {hits.map((hit) => {
              const key = String(hit.project_id ?? hit.id ?? hit.slug);
              const title = String(hit.title ?? hit.name ?? key);
              const downloads = Number(hit.downloads ?? hit.downloadCount ?? 0);
              return (
                <tr key={key}>
                  <td>
                    <div className="fw-semibold">{title}</div>
                    <div className="small text-secondary text-truncate" style={{ maxWidth: 360 }}>
                      {String(hit.description ?? hit.summary ?? "")}
                    </div>
                  </td>
                  <td>
                    <Badge bg="secondary">{downloads.toLocaleString()}</Badge>
                  </td>
                  <td className="text-end">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!canUpdate || !!installing}
                      onClick={() => void installHit(hit)}
                    >
                      {installing === title ? <Spinner size="sm" /> : t("modpacks.install")}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
