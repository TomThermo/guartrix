import { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "react-bootstrap";
import { api } from "../../api";
import { useI18n } from "../../i18n/react";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import {
  getExistingPushSubscription,
  pushSupported,
  serializePushSubscription,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "../../push";

type Props = {
  onNotice: (msg: string | null) => void;
  onError: (msg: string | null) => void;
};

export function PushNotificationsSection({ onNotice, onError }: Props) {
  const { t } = useI18n();
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushCount, setPushCount] = useState(0);
  const [pushLocal, setPushLocal] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const refreshPush = useCallback(async () => {
    try {
      const status = await api.getPushStatus();
      setPushConfigured(status.configured);
      setPushCount(status.subscriptionCount);
    } catch {
      setPushConfigured(false);
      setPushCount(0);
    }
    if (pushSupported()) {
      const sub = await getExistingPushSubscription();
      setPushLocal(Boolean(sub));
    } else {
      setPushLocal(false);
    }
  }, []);

  useEffect(() => {
    void refreshPush().catch((err) =>
      onError(err instanceof Error ? err.message : t("common.requestFailed")),
    );
  }, [refreshPush, onError, t]);

  async function enablePush() {
    setPushBusy(true);
    onError(null);
    onNotice(null);
    try {
      const status = await api.getPushStatus();
      if (!status.configured || !status.publicKey) {
        throw new Error(t("account.pushNotConfigured"));
      }
      const sub = await subscribeBrowserPush(status.publicKey);
      await api.subscribePush({
        ...serializePushSubscription(sub),
        userAgent: navigator.userAgent.slice(0, 512),
      });
      onNotice("Push alerts enabled for this browser.");
      await refreshPush();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setPushBusy(true);
    onError(null);
    onNotice(null);
    try {
      const endpoint = await unsubscribeBrowserPush();
      if (endpoint) await api.unsubscribePush(endpoint);
      else await api.clearPushSubscriptions();
      onNotice("Push alerts disabled for this browser.");
      await refreshPush();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setPushBusy(false);
    }
  }

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
              onClick={() => void disablePush()}
            >
              {pushBusy ? t("common.waiting") : t("account.pushDisable")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={pushBusy}
              onClick={() => void enablePush()}
            >
              {pushBusy ? t("common.waiting") : t("account.pushEnable")}
            </Button>
          )}
        </div>
      )}
    </AdminPanelCard>
  );
}
