import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";
import { copyText } from "../../utils";

export type TwoFactorStep = "idle" | "setup" | "recovery" | "disable" | "regen";

export type TwoFactorStatus = {
  enabled: boolean;
  required: boolean;
};

export function useTwoFactorSection(
  onNotice: (msg: string | null) => void,
  onError: (msg: string | null) => void,
  onStatusChange?: (status: TwoFactorStatus) => void,
) {
  const { refreshUser } = useAuth();
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [required, setRequired] = useState(false);
  const [recoveryLeft, setRecoveryLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<TwoFactorStep>("idle");
  const [secretGrouped, setSecretGrouped] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const refresh = useCallback(async () => {
    const status = await api.getTwoFactor();
    setEnabled(status.enabled);
    setRequired(status.required);
    setRecoveryLeft(status.recoveryCodesRemaining);
    onStatusChange?.({ enabled: status.enabled, required: status.required });
  }, [onStatusChange]);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => onError(err instanceof Error ? err.message : t("common.requestFailed")))
      .finally(() => setLoading(false));
  }, [refresh, onError, t]);

  async function startSetup() {
    setBusy(true);
    onError(null);
    onNotice(null);
    setRecoveryCodes(null);
    try {
      const setup = await api.setupTwoFactor();
      setSecretGrouped(setup.secretGrouped);
      setOtpauth(setup.otpauthUrl);
      setCode("");
      setStep("setup");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const result = await api.enableTwoFactor(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setStep("recovery");
      setCode("");
      await refresh();
      await refreshUser();
      onNotice("Two-factor authentication is now on.");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("auth.invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelSetup() {
    setBusy(true);
    onError(null);
    try {
      await api.cancelTwoFactorSetup();
      setStep("idle");
      setSecretGrouped("");
      setOtpauth("");
      setCode("");
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDisable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await api.disableTwoFactor(password, code.trim());
      setPassword("");
      setCode("");
      setStep("idle");
      onNotice("Two-factor authentication disabled.");
      await refresh();
      await refreshUser();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRegen(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError(null);
    try {
      const result = await api.regenerateRecoveryCodes(password, code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setPassword("");
      setCode("");
      setStep("recovery");
      onNotice("New recovery codes generated — save them now.");
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  function copyCodes() {
    if (!recoveryCodes) return;
    void copyText(recoveryCodes.join("\n")).then(
      () => onNotice("Recovery codes copied."),
      () => undefined,
    );
  }

  return {
    enabled,
    required,
    recoveryLeft,
    loading,
    busy,
    step,
    setStep,
    secretGrouped,
    otpauth,
    code,
    setCode,
    password,
    setPassword,
    recoveryCodes,
    setRecoveryCodes,
    startSetup,
    confirmEnable,
    cancelSetup,
    onDisable,
    onRegen,
    copyCodes,
    onError,
  };
}
