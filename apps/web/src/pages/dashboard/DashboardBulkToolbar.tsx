import { Button, Form } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export function DashboardBulkToolbar({
  allFilteredSelected,
  selectedCount,
  bulkBusy,
  onToggleSelectAll,
  onBulkAct,
}: {
  allFilteredSelected: boolean;
  selectedCount: number;
  bulkBusy: boolean;
  onToggleSelectAll: () => void;
  onBulkAct: (action: "start" | "stop" | "restart") => void;
}) {
  const { t } = useI18n();
  return (
    <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
      <Form.Check
        type="checkbox"
        id="dashboard-select-all"
        label={t("dashboard.selectAllFiltered")}
        checked={allFilteredSelected}
        onChange={onToggleSelectAll}
      />
      <span className="text-secondary small">
        {t("dashboard.selectedCount", { count: selectedCount })}
      </span>
      <div className="flex-grow-1" />
      <Button
        size="sm"
        variant="success"
        disabled={bulkBusy || selectedCount === 0}
        onClick={() => onBulkAct("start")}
      >
        {t("dashboard.bulkStart")}
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={bulkBusy || selectedCount === 0}
        onClick={() => onBulkAct("stop")}
      >
        {t("dashboard.bulkStop")}
      </Button>
      <Button
        size="sm"
        variant="primary"
        disabled={bulkBusy || selectedCount === 0}
        onClick={() => onBulkAct("restart")}
      >
        {t("dashboard.bulkRestart")}
      </Button>
    </div>
  );
}
