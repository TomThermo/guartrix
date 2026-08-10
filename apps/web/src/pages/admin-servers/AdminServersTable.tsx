import { Link } from "react-router-dom";
import type { AdminServerRow } from "@guartrix/shared";
import { Alert, Badge, Button, Col, Form, Row, Table } from "react-bootstrap";
import { AdminInsetCard, AdminPanelCard } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";

function statusVariant(status: string): "success" | "warning" | "secondary" | "danger" {
  if (status === "RUNNING") return "success";
  if (status === "STARTING" || status === "STOPPING") return "warning";
  if (status === "ERROR") return "danger";
  return "secondary";
}

export function AdminServersTable({
  servers,
  filtered,
  filter,
  onFilterChange,
  onEdit,
}: {
  servers: AdminServerRow[];
  filtered: AdminServerRow[];
  filter: string;
  onFilterChange: (value: string) => void;
  onEdit: (row: AdminServerRow) => void;
}) {
  const { t } = useI18n();

  return (
    <AdminPanelCard
      title={t("adminServers.serversTitle", { count: servers.length })}
      icon="fa-table-list"
    >
      <Row className="g-3 mb-3">
        <Col md={8}>
          <Form.Control
            type="search"
            placeholder={t("adminServers.searchPlaceholder")}
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
        </Col>
        <Col md={4} className="text-md-end">
          <Link to="/admin/settings?tab=backup" className="btn btn-outline-secondary btn-sm">
            <i className="fa-solid fa-sliders me-2" aria-hidden />
            {t("adminServers.defaultBackupLink")}
          </Link>
        </Col>
      </Row>

      {filtered.length === 0 ? (
        <Alert variant="light" className="border mb-0">
          {t("adminServers.empty")}
        </Alert>
      ) : (
        <AdminInsetCard className="p-0 overflow-auto">
          <Table hover responsive className="mb-0 align-middle">
            <thead>
              <tr>
                <th>{t("adminServers.colServer")}</th>
                <th>{t("adminServers.colOwner")}</th>
                <th>{t("adminServers.colNode")}</th>
                <th>{t("adminServers.colStatus")}</th>
                <th className="text-end">{t("adminServers.colRam")}</th>
                <th className="text-end">{t("adminServers.colDisk")}</th>
                <th className="text-end">{t("adminServers.colCpu")}</th>
                <th>{t("adminServers.colBackups")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const over = row.backupCount > row.keepCount;
                return (
                  <tr key={row.id} className={row.suspended ? "table-warning" : undefined}>
                    <td>
                      <Link to={`/servers/${row.id}`} className="fw-semibold text-decoration-none">
                        {row.name}
                      </Link>
                      {row.suspended ? (
                        <Badge bg="warning" text="dark" className="ms-2">
                          {t("adminServers.suspendedBadge")}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="text-secondary">{row.ownerUsername}</td>
                    <td className="text-secondary">{row.nodeName ?? "—"}</td>
                    <td>
                      <Badge bg={statusVariant(row.status)}>{row.status}</Badge>
                    </td>
                    <td className="text-end">{Math.round(row.memoryMb / 1024)} GB</td>
                    <td className="text-end">{Math.round(row.diskMb / 1024)} GB</td>
                    <td className="text-end">
                      {row.cpuLimit === 0 ? t("createServer.unlimited") : `${row.cpuLimit}%`}
                    </td>
                    <td>
                      <span className={over ? "text-warning fw-semibold" : undefined}>
                        {row.backupCount}/{row.keepCount}
                      </span>
                      {over ? (
                        <div className="small text-warning">{t("adminServers.overLimit")}</div>
                      ) : null}
                    </td>
                    <td className="text-end">
                      <Button size="sm" variant="outline-primary" onClick={() => onEdit(row)}>
                        {t("adminServers.edit")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </AdminInsetCard>
      )}
    </AdminPanelCard>
  );
}
