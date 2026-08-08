import { useState } from "react";
import { ActivityPanel } from "../components/ActivityPanel";
import { AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { useI18n } from "../i18n/react";

export function AdminActivityPage() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  return (
    <AdminPageShell
      title={t("admin.activityTitle")}
      subtitle={t("admin.activitySubtitle")}
      icon="fa-list-check"
      backTo="/"
      backLabel={t("common.back")}
      error={error}
      onDismissError={() => setError(null)}
    >
      <AdminPanelCard>
        <ActivityPanel showServer onError={setError} />
      </AdminPanelCard>
    </AdminPageShell>
  );
}
