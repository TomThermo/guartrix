import { Button, Spinner } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";
import {
  TwoFactorPasswordCodePanel,
  TwoFactorRecoveryPanel,
  TwoFactorSetupPanel,
} from "./TwoFactorStepPanels";
import { useTwoFactorSection, type TwoFactorStatus, type TwoFactorStep } from "./useTwoFactorSection";

export type { TwoFactorStatus, TwoFactorStep };

type Props = {
  onNotice: (msg: string | null) => void;
  onError: (msg: string | null) => void;
  onStatusChange?: (status: TwoFactorStatus) => void;
};

export function TwoFactorSection({ onNotice, onError, onStatusChange }: Props) {
  const { t } = useI18n();
  const tf = useTwoFactorSection(onNotice, onError, onStatusChange);

  if (tf.loading) {
    return (
      <div className="text-secondary py-4">
        <Spinner size="sm" className="me-2" />
        {t("common.loading")}…
      </div>
    );
  }

  return (
    <AdminPanelCard title={t("account.totpTitle")} icon="fa-mobile-screen" className="mb-4">
      <div className="account-status-row">
        <span>{t("account.totpStatus")}</span>
        <span className={`account-status-chip ${tf.enabled ? "is-on" : "is-off"}`}>
          <i className={`fa-solid ${tf.enabled ? "fa-lock" : "fa-lock-open"}`} aria-hidden />
          {tf.enabled ? t("common.enabled") : t("common.off")}
        </span>
        {tf.required && (
          <span className="account-status-chip is-off">
            {t("account.totpRequiredRole").replace(/^ · /, "")}
          </span>
        )}
        {tf.enabled && tf.recoveryLeft > 0 && (
          <span className="account-status-chip is-on">
            {tf.recoveryLeft === 1
              ? t("account.totpRecoveryLeft", { count: tf.recoveryLeft }).replace(/^ · /, "")
              : t("account.totpRecoveryLeftPlural", { count: tf.recoveryLeft }).replace(/^ · /, "")}
          </span>
        )}
      </div>

      {tf.step === "idle" && !tf.enabled && (
        <Button variant="primary" disabled={tf.busy} onClick={() => void tf.startSetup()}>
          {tf.busy ? t("account.totpStarting") : t("account.totpEnable")}
        </Button>
      )}

      {tf.step === "idle" && tf.enabled && (
        <div className="d-flex flex-wrap gap-2">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => {
              tf.setStep("regen");
              tf.setCode("");
              tf.setPassword("");
              tf.onError(null);
            }}
          >
            {t("account.totpNewRecovery")}
          </Button>
          {!tf.required && (
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => {
                tf.setStep("disable");
                tf.setCode("");
                tf.setPassword("");
                tf.onError(null);
              }}
            >
              {t("account.totpDisable")}
            </Button>
          )}
        </div>
      )}

      {tf.step === "setup" && (
        <TwoFactorSetupPanel
          secretGrouped={tf.secretGrouped}
          otpauth={tf.otpauth}
          code={tf.code}
          busy={tf.busy}
          onCodeChange={tf.setCode}
          onSubmit={(e) => void tf.confirmEnable(e)}
          onCancel={() => void tf.cancelSetup()}
        />
      )}

      {tf.step === "disable" && (
        <TwoFactorPasswordCodePanel
          idPrefix="disable"
          password={tf.password}
          code={tf.code}
          busy={tf.busy}
          submitLabel={t("account.totpDisableConfirm")}
          submitBusyLabel={t("account.totpDisabling")}
          submitVariant="danger"
          onPasswordChange={tf.setPassword}
          onCodeChange={tf.setCode}
          onSubmit={(e) => void tf.onDisable(e)}
          onCancel={() => tf.setStep("idle")}
        />
      )}

      {tf.step === "regen" && (
        <TwoFactorPasswordCodePanel
          idPrefix="regen"
          help={t("account.totpRegenHelp")}
          password={tf.password}
          code={tf.code}
          busy={tf.busy}
          submitLabel={t("account.totpGenerateCodes")}
          submitBusyLabel={t("account.totpGenerating")}
          submitVariant="primary"
          onPasswordChange={tf.setPassword}
          onCodeChange={tf.setCode}
          onSubmit={(e) => void tf.onRegen(e)}
          onCancel={() => tf.setStep("idle")}
        />
      )}

      {tf.step === "recovery" && tf.recoveryCodes && (
        <TwoFactorRecoveryPanel
          recoveryCodes={tf.recoveryCodes}
          onCopy={tf.copyCodes}
          onDone={() => {
            tf.setRecoveryCodes(null);
            tf.setStep("idle");
          }}
        />
      )}
    </AdminPanelCard>
  );
}
