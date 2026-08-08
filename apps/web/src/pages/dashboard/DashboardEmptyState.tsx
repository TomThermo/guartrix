import { Link } from "react-router-dom";
import { Card } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export function DashboardEmptyState({ canCreate }: { canCreate: boolean }) {
  const { t } = useI18n();
  return (
    <Card className="border-0 shadow-sm text-center py-5">
      <Card.Body>
        <i className="fa-solid fa-cube fa-2x text-secondary mb-3" />
        <h2 className="h5">{t("dashboard.emptyTitle")}</h2>
        <p className="text-secondary">{t("dashboard.emptyBlurb")}</p>
        {canCreate && (
          <Link to="/servers/new" className="btn btn-primary">
            <i className="fa-solid fa-plus me-1" aria-hidden />
            {t("nav.newServer")}
          </Link>
        )}
      </Card.Body>
    </Card>
  );
}
