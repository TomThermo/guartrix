import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ServerDatabase } from "@msm/shared";
import { databaseNamePrefix, DEFAULT_MAX_DATABASES } from "@msm/shared";
import {
  Alert,
  Button,
  Col,
  Form,
  InputGroup,
  Row,
  Spinner,
  Stack,
  Table,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { copyText } from "../utils";

interface Props {
  serverId: string;
  canCreate?: boolean;
  canDelete?: boolean;
  onError: (message: string | null) => void;
  onNotice: (message: string | null) => void;
}

export function DatabasesPanel({
  serverId,
  canCreate = true,
  canDelete = true,
  onError,
  onNotice,
}: Props) {
  const { t } = useI18n();
  const [databases, setDatabases] = useState<ServerDatabase[]>([]);
  const [prefix, setPrefix] = useState(() => databaseNamePrefix(serverId));
  const [used, setUsed] = useState(0);
  const [limit, setLimit] = useState<number | null>(DEFAULT_MAX_DATABASES);
  const [remaining, setRemaining] = useState<number | null>(DEFAULT_MAX_DATABASES);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [suffix, setSuffix] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const atLimit = remaining != null && remaining <= 0;
  const limitLabel = limit == null ? "unlimited" : String(limit);

  const refresh = useCallback(async () => {
    const data = await api.listDatabases(serverId);
    setDatabases(data.databases);
    setPrefix(data.prefix || databaseNamePrefix(serverId));
    setUsed(data.used);
    setLimit(data.limit);
    setRemaining(data.remaining);
  }, [serverId]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) =>
        onError(err instanceof Error ? err.message : t("databases.loadFailed")),
      )
      .finally(() => setLoading(false));
  }, [refresh, onError]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    const name = suffix.trim();
    if (!name) {
      onError("Enter a database name.");
      return;
    }
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.createDatabase(serverId, { name });
      setSuffix("");
      onNotice("Database created. Username and password were generated automatically.");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create database");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(db: ServerDatabase) {
    if (!canDelete) return;
    if (!window.confirm(`Delete database “${db.name}”?`)) return;
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      await api.deleteDatabase(serverId, db.id);
      onNotice(`Database “${db.name}” deleted.`);
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not delete database");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-secondary">
        <Spinner animation="border" size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
    <div className="databases-panel">
      <header className="databases-panel-header">
        <h2 className="databases-panel-title">{t("databases.title")}</h2>
        <p className="databases-panel-lead mb-0">
          All databases available for this server.
        </p>
      </header>

      <Row className="g-3 databases-layout">
        <Col xs={12} lg={9}>
          <section className="databases-section h-100">
            <h3 className="databases-section-title">Your databases</h3>
            {databases.length === 0 ? (
              <p className="databases-empty mb-0">
                {t("databases.empty")}
              </p>
            ) : (
              <div className="table-responsive">
                <Table hover size="sm" className="align-middle mb-0 databases-table">
                  <thead>
                    <tr>
                      <th>Database</th>
                      <th>Host / Port</th>
                      <th>Username</th>
                      <th>Password</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {databases.map((db) => (
                      <tr key={db.id}>
                        <td>
                          <code>{db.name}</code>
                        </td>
                        <td>
                          <Stack gap={1}>
                            <InputGroup size="sm">
                              <Form.Control readOnly value={db.host} />
                              <Button
                                variant="outline-secondary"
                                onClick={() => {
                                  void copyText(db.host);
                                  onNotice("Host copied.");
                                }}
                              >
                                <i className="fa-solid fa-copy" aria-hidden />
                              </Button>
                            </InputGroup>
                            <span className="text-secondary small">Port {db.port}</span>
                          </Stack>
                        </td>
                        <td>
                          <InputGroup size="sm">
                            <Form.Control readOnly value={db.username} />
                            <Button
                              variant="outline-secondary"
                              onClick={() => {
                                void copyText(db.username);
                                onNotice("Username copied.");
                              }}
                            >
                              <i className="fa-solid fa-copy" aria-hidden />
                            </Button>
                          </InputGroup>
                        </td>
                        <td>
                          <InputGroup size="sm">
                            <Form.Control
                              readOnly
                              type={revealed[db.id] ? "text" : "password"}
                              value={db.password}
                            />
                            <Button
                              variant="outline-secondary"
                              onClick={() =>
                                setRevealed((prev) => ({
                                  ...prev,
                                  [db.id]: !prev[db.id],
                                }))
                              }
                            >
                              <i
                                className={`fa-solid ${revealed[db.id] ? "fa-eye-slash" : "fa-eye"}`}
                                aria-hidden
                              />
                            </Button>
                            <Button
                              variant="outline-secondary"
                              onClick={() => {
                                void copyText(db.password);
                                onNotice("Password copied.");
                              }}
                            >
                              <i className="fa-solid fa-copy" aria-hidden />
                            </Button>
                          </InputGroup>
                        </td>
                        <td className="text-end">
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="outline-danger"
                              disabled={busy}
                              onClick={() => void onDelete(db)}
                            >
                              {t("databases.delete")}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </section>
        </Col>

        {canCreate && (
          <Col xs={12} lg={3}>
            <section className="databases-section databases-create h-100">
              <h3 className="databases-section-title">{t("databases.create")}</h3>
              <Form onSubmit={onCreate} className="databases-create-form">
                <Form.Group className="mb-3">
                  <Form.Label>Database</Form.Label>
                  <InputGroup>
                    <InputGroup.Text className="font-monospace databases-prefix">
                      {prefix}
                    </InputGroup.Text>
                    <Form.Control
                      value={suffix}
                      onChange={(e) =>
                        setSuffix(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
                      }
                      placeholder="databasename"
                      disabled={busy || atLimit}
                      maxLength={32}
                      autoComplete="off"
                      spellCheck={false}
                      className="font-monospace"
                      required
                    />
                  </InputGroup>
                  <Form.Text className="databases-hint">
                    You are currently using {used} of {limitLabel} databases. A
                    username and password for this database will be randomly
                    generated after form submission.
                  </Form.Text>
                </Form.Group>

                <Alert variant="warning" className="databases-warn small mb-3">
                  Please do not use your database for Dynmap or Coreprotect. This
                  does not improve performance.
                </Alert>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-100"
                  disabled={busy || atLimit}
                >
                  {busy ? t("common.creating") : t("databases.create")}
                </Button>
              </Form>
            </section>
          </Col>
        )}
      </Row>
    </div>
  );
}
