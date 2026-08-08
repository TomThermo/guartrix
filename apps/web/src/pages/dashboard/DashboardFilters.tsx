import { Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { typeLabel } from "../../utils";
import type { StatusFilter } from "./types";

export function DashboardFilters({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  nodeFilter,
  onNodeFilterChange,
  typeFilter,
  onTypeFilterChange,
  nodeOptions,
  typeOptions,
  filteredCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  nodeFilter: string;
  onNodeFilterChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  nodeOptions: Array<[string, string]>;
  typeOptions: string[];
  filteredCount: number;
  totalCount: number;
}) {
  const { t } = useI18n();
  return (
    <Row className="g-2 mb-3 align-items-end">
      <Col md={4}>
        <Form.Label className="small text-secondary mb-1">{t("dashboard.search")}</Form.Label>
        <Form.Control
          value={query}
          placeholder={t("dashboard.searchPlaceholder")}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </Col>
      <Col xs={6} md={2}>
        <Form.Label className="small text-secondary mb-1">{t("dashboard.status")}</Form.Label>
        <Form.Select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
        >
          <option value="all">{t("dashboard.allStatuses")}</option>
          <option value="online">{t("dashboard.online")}</option>
          <option value="offline">{t("dashboard.offline")}</option>
          <option value="busy">{t("dashboard.busy")}</option>
          <option value="error">{t("dashboard.error")}</option>
        </Form.Select>
      </Col>
      <Col xs={6} md={3}>
        <Form.Label className="small text-secondary mb-1">{t("dashboard.node")}</Form.Label>
        <Form.Select value={nodeFilter} onChange={(e) => onNodeFilterChange(e.target.value)}>
          <option value="all">{t("dashboard.allNodes")}</option>
          {nodeOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Form.Select>
      </Col>
      <Col xs={6} md={2}>
        <Form.Label className="small text-secondary mb-1">{t("dashboard.type")}</Form.Label>
        <Form.Select value={typeFilter} onChange={(e) => onTypeFilterChange(e.target.value)}>
          <option value="all">{t("dashboard.allTypes")}</option>
          {typeOptions.map((typeId) => (
            <option key={typeId} value={typeId}>
              {typeLabel(typeId)}
            </option>
          ))}
        </Form.Select>
      </Col>
      <Col xs={6} md={1} className="pb-2">
        <span className="small text-secondary">
          {filteredCount}/{totalCount}
        </span>
      </Col>
    </Row>
  );
}
