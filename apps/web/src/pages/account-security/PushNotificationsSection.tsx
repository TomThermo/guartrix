import { Alert, Button } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import { pushSupported } from "../../push";

interface Props {
  pushConfigured: boolean;
  pushCount: number;
  pushLocal: boolean;
  pushBusy: boolean;
  onEnable: () => void;
  onDisable: () => void;
}

export function PushNotificationsSection({
  pushConfigured,
  pushCount,
  pushLocal,
  pushBusy,
  onEnable,
  onDisable,
}: Props) {
  const { t } = useI18n();

  return (
    <AdminPanelCard title={t("account.pushTitle")} icon="fa-bell" className="mb-4">
      <p className="text-secondary small mb-3">{t("account.pushHelp")}</p>
      {!pushSupported() ? (
        <p className="text-secondary small mb-0">{t("account.pushUnsupported")}</p>
      ) : !pushConfigured ? (
        <Alert variant="secondary" className="py-2 mb-0">
          {t("account.pushNotConfigured")}
        </Alert>
      ) : (
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="small text-secondary">
            {t("account.pushThisBrowser")}{" "}
            <span className={`account-status-chip ${pushLocal ? "is-on" : "is-off"}`}>
              <i
                className={`fa-solid ${pushLocal ? "fa-circle-check" : "fa-circle"}`}
                aria-hidden
              />
              {pushLocal ? t("account.pushEnabled") : t("account.pushOff")}
            </span>
            {pushCount > 0 && (
              <>
                {" "}
                {pushCount === 1
                  ? t("account.pushDevices", { count: pushCount })
                  : t("account.pushDevicesPlural", { count: pushCount })}
              </>
            )}
          </span>
          {pushLocal ? (
            <Button
              size="sm"
              variant="outline-secondary"
              disabled={pushBusy}
              onClick={() => void onDisable()}
            >
              {pushBusy ? t("common.waiting") : t("account.pushDisable")}
            </Button>
          ) : (
            <Button size="sm" variant="primary" disabled={pushBusy} onClick={() => void onEnable()}>
              {pushBusy ? t("common.waiting") : t("account.pushEnable")}
            </Button>
          )}
        </div>
      )}
    </AdminPanelCard>
  );
}
