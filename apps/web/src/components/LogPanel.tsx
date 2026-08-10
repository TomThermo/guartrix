import { useCallback, useEffect, useState } from "react";
import type { LogContentResponse, LogFileInfo } from "@guartrix/shared";
import { Button, Col, ListGroup, Row, Spinner } from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { formatWhen } from "../utils";

interface Props {
  serverId: string;
  onError: (message: string | null) => void;
}

export function LogPanel({ serverId, onError }: Props) {
  const { t } = useI18n();
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<LogContentResponse | null>(null);
  const [reading, setReading] = useState(false);

  const refresh = useCallback(async () => {
    const data = await api.listLogs(serverId);
    setFiles(data.files);
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : t("logs.loadFailed")))
      .finally(() => setLoading(false));
  }, [refresh, onError, t]);

  async function openLog(path: string) {
    setSelected(path);
    setReading(true);
    onError(null);
    try {
      const data = await api.readLog(serverId, path);
      setContent(data);
    } catch (err) {
      setContent(null);
      onError(err instanceof Error ? err.message : "Failed to read log");
    } finally {
      setReading(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-4 text-secondary">
        <Spinner animation="border" size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
    <div>
      <h2 className="h5 mb-2">{t("logs.title")}</h2>
      <Row className="g-3">
        <Col lg={4}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h3 className="h6 mb-0">Files ({files.length})</h3>
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => void refresh().catch(() => undefined)}
            >
              <i className="fa-solid fa-rotate" />
            </Button>
          </div>
          <ListGroup style={{ maxHeight: 480, overflow: "auto" }}>
            {files.length === 0 && (
              <ListGroup.Item className="text-secondary">{t("logs.empty")}</ListGroup.Item>
            )}
            {files.map((f) => (
              <ListGroup.Item
                key={f.path}
                action
                active={selected === f.path}
                onClick={() => void openLog(f.path)}
                className="small"
              >
                <div className="fw-semibold font-monospace text-break">{f.name}</div>
                <div className={selected === f.path ? "opacity-75" : "text-secondary"}>
                  {f.sizeLabel} · {formatWhen(f.modifiedAt)}
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Col>
        <Col lg={8}>
          {!selected && (
            <div className="text-secondary border rounded p-4 text-center">
              Select a log file to view
            </div>
          )}
          {reading && (
            <div className="text-center py-4 text-secondary">
              <Spinner animation="border" size="sm" className="me-2" />
              Reading…
            </div>
          )}
          {content && !reading && (
            <div>
              <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <div className="small text-secondary font-monospace text-break">
                  {content.path}
                  {content.truncated && " (truncated)"}
                </div>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => selected && void openLog(selected)}
                >
                  Reload
                </Button>
              </div>
              <pre
                className="bg-dark text-light p-3 rounded small mb-0"
                style={{
                  maxHeight: 520,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {content.content || "(empty)"}
              </pre>
            </div>
          )}
        </Col>
      </Row>
    </div>
  );
}
