import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActivityEventRecord, ActivityQuery } from "@msm/shared";
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_CATEGORY_META,
  ACTIVITY_PAGE_DEFAULT,
  activityCategoryIcon,
  activityDetail,
} from "@msm/shared";
import { Badge, Button, Col, Form, Row, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useI18n } from "../i18n/react";
import { formatWhen } from "../utils";

interface Props {
  /** Omit for the global admin view. */
  serverId?: string;
  /** Filter to a single actor (admin Users page). */
  userId?: string;
  /** Show a "Server" column and link to each server (admin view). */
  showServer?: boolean;
  onError: (message: string | null) => void;
}

export function ActivityPanel({
  serverId,
  userId,
  showServer = false,
  onError,
}: Props) {
  const { t } = useI18n();
  const [events, setEvents] = useState<ActivityEventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [retentionDays, setRetentionDays] = useState(0);
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = ACTIVITY_PAGE_DEFAULT;

  const actionOptions = useMemo(() => {
    const entries = Object.entries(ACTIVITY_ACTIONS).filter(
      ([, meta]) => !category || meta.category === category,
    );
    return entries
      .map(([key, meta]) => ({ key, label: meta.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [category]);

  const load = useCallback(
    async (nextOffset: number) => {
      const params: ActivityQuery = {
        offset: nextOffset,
        limit,
        ...(category ? { category } : {}),
        ...(action ? { action } : {}),
        ...(query ? { q: query } : {}),
        ...(userId ? { userId } : {}),
      };
      const data = serverId
        ? await api.listServerActivity(serverId, params)
        : await api.listAdminActivity(params);
      setEvents(data.events);
      setTotal(data.total);
      setRetentionDays(data.retentionDays);
      setOffset(data.offset);
    },
    [action, category, limit, query, serverId, userId],
  );

  useEffect(() => {
    setLoading(true);
    void load(0)
      .catch((err) =>
        onError(err instanceof Error ? err.message : t("activity.loadFailed")),
      )
      .finally(() => setLoading(false));
  }, [load, onError]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setQuery(search.trim());
  }

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  async function goTo(nextOffset: number) {
    setLoading(true);
    onError(null);
    try {
      await load(nextOffset);
    } catch (err) {
      onError(err instanceof Error ? err.message : t("activity.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  function downloadBlob(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    downloadBlob(
      `activity-${Date.now()}.json`,
      JSON.stringify({ total, events }, null, 2),
      "application/json",
    );
  }

  function exportCsv() {
    const headers = [
      "createdAt",
      "action",
      "category",
      "actorName",
      "actorIp",
      "serverName",
      "serverId",
      "success",
      "detail",
    ];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = events.map((ev) =>
      [
        ev.createdAt,
        ev.action,
        ev.category,
        ev.actorName,
        ev.actorIp ?? "",
        ev.serverName ?? "",
        ev.serverId ?? "",
        String(ev.success),
        activityDetail(ev) ?? "",
      ]
        .map((c) => escape(String(c)))
        .join(","),
    );
    downloadBlob(
      `activity-${Date.now()}.csv`,
      [headers.join(","), ...rows].join("\n"),
      "text/csv",
    );
  }

  return (
    <div className="databases-panel">
      <header className="databases-panel-header d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h2 className="databases-panel-title">{t("activity.title")}</h2>
          <p className="databases-panel-lead mb-0">
            Who started, stopped or changed what
            {serverId ? " on this server" : userId ? " for this user" : " across the panel"}.
            {retentionDays > 0
              ? ` Events are kept for ${retentionDays} days.`
              : " Events are kept indefinitely."}
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={!events.length}
            onClick={exportCsv}
          >
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={!events.length}
            onClick={exportJson}
          >
            JSON
          </Button>
        </div>
      </header>

      <Form onSubmit={submitSearch}>
        <Row className="g-2 align-items-end mb-3">
          <Col xs={6} md={3}>
            <Form.Label className="small text-secondary mb-1">Category</Form.Label>
            <Form.Select
              size="sm"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setAction("");
              }}
            >
              <option value="">All categories</option>
              {ACTIVITY_CATEGORY_META.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Form.Select>
          </Col>
          <Col xs={6} md={3}>
            <Form.Label className="small text-secondary mb-1">Action</Form.Label>
            <Form.Select
              size="sm"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">All actions</option>
              {actionOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Form.Select>
          </Col>
          <Col xs={12} md={4}>
            <Form.Label className="small text-secondary mb-1">{t("common.search")}</Form.Label>
            <Form.Control
              size="sm"
              value={search}
              placeholder="User, server, IP or detail…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </Col>
          <Col xs={12} md={2} className="d-flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={loading}>
              Filter
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline-secondary"
              disabled={loading}
              onClick={() => {
                setCategory("");
                setAction("");
                setSearch("");
                setQuery("");
              }}
            >
              Reset
            </Button>
          </Col>
        </Row>
      </Form>

      {loading ? (
        <div className="p-4 text-center text-secondary">
          <Spinner animation="border" size="sm" className="me-2" />
          {t("common.loading")}…
        </div>
      ) : events.length === 0 ? (
        <p className="databases-empty mb-0">{t("activity.empty")}</p>
      ) : (
        <div className="table-responsive">
          <Table hover size="sm" className="align-middle mb-0 databases-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                {showServer && <th>Server</th>}
                <th>Action</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="text-nowrap text-secondary small">
                    {formatWhen(event.createdAt)}
                  </td>
                  <td className="text-nowrap">{event.actorName}</td>
                  {showServer && (
                    <td className="text-nowrap">
                      {event.serverId ? (
                        <Link to={`/servers/${event.serverId}`}>
                          {event.serverName ?? event.serverId}
                        </Link>
                      ) : (
                        (event.serverName ?? "—")
                      )}
                    </td>
                  )}
                  <td>
                    <i
                      className={`fa-solid ${activityCategoryIcon(event.category)} me-2 text-secondary`}
                    />
                    {event.label}
                    {!event.success && (
                      <Badge bg="danger" className="ms-2">
                        Failed
                      </Badge>
                    )}
                  </td>
                  <td className="text-secondary small">
                    {activityDetail(event) || "—"}
                  </td>
                  <td className="text-secondary small font-monospace">
                    {event.actorIp ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {total > limit && (
        <div className="d-flex align-items-center justify-content-between mt-3">
          <span className="text-secondary small">
            Page {page} of {pages} · {total} events
          </span>
          <div className="d-flex gap-2">
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={loading || offset === 0}
              onClick={() => void goTo(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={loading || offset + limit >= total}
              onClick={() => void goTo(offset + limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
