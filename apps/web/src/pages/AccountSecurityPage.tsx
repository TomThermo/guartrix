import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Col, Nav, Row } from "react-bootstrap";
import { api } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n/react";
import { ApiKeysPanel } from "../components/ApiKeysPanel";
import { AppPasswordsPanel } from "../components/AppPasswordsPanel";
import { AdminPageShell, AdminPanelCard } from "../components/admin/AdminPageShell";
import { copyText } from "../utils";
import {
  getExistingPushSubscription,
  pushSupported,
  serializePushSubscription,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "../push";
import { AppearanceSection } from "./account-security/AppearanceSection";
import { ProfileSection } from "./account-security/ProfileSection";
import { DeleteAccountModal, DeleteAccountSection } from "./account-security/DeleteAccountSection";
import { PushNotificationsSection } from "./account-security/PushNotificationsSection";
import { TwoFactorSection, type TwoFactorStep } from "./account-security/TwoFactorSection";

type AccountTab = "profile" | "security" | "access" | "notifications" | "appearance" | "privacy";

const ACCOUNT_TABS: Array<{ id: AccountTab; icon: string; labelKey: string }> = [
  { id: "profile", icon: "fa-id-card", labelKey: "account.tabProfile" },
  { id: "security", icon: "fa-shield-halved", labelKey: "account.tabSecurity" },
  { id: "access", icon: "fa-key", labelKey: "account.tabAccess" },
  { id: "notifications", icon: "fa-bell", labelKey: "account.tabNotifications" },
  { id: "appearance", icon: "fa-palette", labelKey: "account.tabAppearance" },
  { id: "privacy", icon: "fa-user-lock", labelKey: "account.tabPrivacy" },
];

function parseAccountTab(value: string | null): AccountTab {
  if (
    value === "profile" ||
    value === "security" ||
    value === "access" ||
    value === "notifications" ||
    value === "appearance" ||
    value === "privacy"
  ) {
    return value;
  }
  return "profile";
}

export function AccountSecurityPage() {
  const { user, refreshUser, authenticated, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseAccountTab(searchParams.get("tab"));
  const [enabled, setEnabled] = useState(false);
  const [required, setRequired] = useState(false);
  const [recoveryLeft, setRecoveryLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<TwoFactorStep>("idle");

  const [secretGrouped, setSecretGrouped] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [exportBusy, setExportBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushCount, setPushCount] = useState(0);
  const [pushLocal, setPushLocal] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const setTab = (next: AccountTab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "profile") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );
  };

  const refresh = useCallback(async () => {
    const status = await api.getTwoFactor();
    setEnabled(status.enabled);
    setRequired(status.required);
    setRecoveryLeft(status.recoveryCodesRemaining);
  }, []);

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
    setLoading(true);
    void Promise.all([refresh(), refreshPush()])
      .catch((err) => setError(err instanceof Error ? err.message : t("common.requestFailed")))
      .finally(() => setLoading(false));
  }, [refresh, refreshPush, t]);

  async function enablePush() {
    setPushBusy(true);
    setError(null);
    setNotice(null);
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
      setNotice("Push alerts enabled for this browser.");
      await refreshPush();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setPushBusy(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint = await unsubscribeBrowserPush();
      if (endpoint) await api.unsubscribePush(endpoint);
      else await api.clearPushSubscriptions();
      setNotice("Push alerts disabled for this browser.");
      await refreshPush();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setPushBusy(false);
    }
  }

  if (!authenticated) return <Navigate to="/login" replace />;

  async function startSetup() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setRecoveryCodes(null);
    try {
      const setup = await api.setupTwoFactor();
      setSecretGrouped(setup.secretGrouped);
      setOtpauth(setup.otpauthUrl);
      setCode("");
      setStep("setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.enableTwoFactor(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setStep("recovery");
      setCode("");
      await refresh();
      await refreshUser();
      setNotice("Two-factor authentication is now on.");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelSetup() {
    setBusy(true);
    setError(null);
    try {
      await api.cancelTwoFactorSetup();
      setStep("idle");
      setSecretGrouped("");
      setOtpauth("");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onDisable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.disableTwoFactor(password, code.trim());
      setPassword("");
      setCode("");
      setStep("idle");
      setNotice("Two-factor authentication disabled.");
      await refresh();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onRegen(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.regenerateRecoveryCodes(password, code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setPassword("");
      setCode("");
      setStep("recovery");
      setNotice("New recovery codes generated — save them now.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  function copyCodes() {
    if (!recoveryCodes) return;
    void copyText(recoveryCodes.join("\n")).then(
      () => setNotice("Recovery codes copied."),
      () => undefined,
    );
  }

  async function onExportData() {
    setExportBusy(true);
    setError(null);
    try {
      await api.exportAccountData();
      setNotice("Account data download started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setExportBusy(false);
    }
  }

  async function onDeleteAccount() {
    if (deleteConfirm !== "DELETE") {
      setError("Type DELETE to confirm account deletion.");
      return;
    }
    if (!deletePassword) {
      setError(`${t("common.required")}: ${t("common.password")}`);
      return;
    }
    setDeleteBusy(true);
    setError(null);
    try {
      await api.deleteAccount(deletePassword);
      setShowDelete(false);
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) {
    return (
      <AdminPageShell
        className="account-page"
        title={t("account.title")}
        subtitle={t("account.subtitle", { username: user?.username ?? "" })}
        icon="fa-user-gear"
        backTo="/"
        backLabel={t("nav.dashboard")}
        loading
        loadingLabel={`${t("common.loading")}…`}
      />
    );
  }

  return (
    <>
      <AdminPageShell
        className="account-page"
        title={t("account.title")}
        subtitle={t("account.subtitle", { username: user?.username ?? "" })}
        icon="fa-user-gear"
        backTo="/"
        backLabel={t("nav.servers")}
        error={error}
        notice={notice}
        onDismissError={() => setError(null)}
        onDismissNotice={() => setNotice(null)}
        warning={
          required && !enabled ? (
            <Alert variant="warning">{t("account.requiredRole")}</Alert>
          ) : undefined
        }
      >
        <Nav
          variant="pills"
          className="gap-1 mb-4 flex-wrap"
          activeKey={tab}
          onSelect={(k) => k && setTab(k as AccountTab)}
        >
          {ACCOUNT_TABS.map((item) => (
            <Nav.Item key={item.id}>
              <Nav.Link eventKey={item.id}>
                <i className={`fa-solid ${item.icon} me-1`} aria-hidden />
                {t(item.labelKey)}
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>

        {tab === "profile" && (
          <ProfileSection onNotice={setNotice} onError={setError} />
        )}

        {tab === "security" && (
          <TwoFactorSection
            enabled={enabled}
            required={required}
            recoveryLeft={recoveryLeft}
            busy={busy}
            step={step}
            secretGrouped={secretGrouped}
            otpauth={otpauth}
            code={code}
            password={password}
            recoveryCodes={recoveryCodes}
            onCodeChange={setCode}
            onPasswordChange={setPassword}
            onStartSetup={() => void startSetup()}
            onConfirmEnable={confirmEnable}
            onCancelSetup={() => void cancelSetup()}
            onDisable={onDisable}
            onRegen={onRegen}
            onCopyCodes={copyCodes}
            onBeginRegen={() => {
              setStep("regen");
              setCode("");
              setPassword("");
              setError(null);
            }}
            onBeginDisable={() => {
              setStep("disable");
              setCode("");
              setPassword("");
              setError(null);
            }}
            onCancelStep={() => setStep("idle")}
            onDoneRecovery={() => {
              setRecoveryCodes(null);
              setStep("idle");
            }}
          />
        )}

        {tab === "access" && (
          <Row className="g-4 mb-4">
            <Col lg={6}>
              <AdminPanelCard title={t("account.sftpAppPasswords")} icon="fa-folder-open">
                <AppPasswordsPanel onError={setError} />
              </AdminPanelCard>
            </Col>
            <Col lg={6}>
              <AdminPanelCard title={t("apiKeys.title")} icon="fa-key">
                <ApiKeysPanel embedded onError={setError} />
              </AdminPanelCard>
            </Col>
          </Row>
        )}

        {tab === "notifications" && (
          <PushNotificationsSection
            pushConfigured={pushConfigured}
            pushCount={pushCount}
            pushLocal={pushLocal}
            pushBusy={pushBusy}
            onEnable={() => void enablePush()}
            onDisable={() => void disablePush()}
          />
        )}

        {tab === "appearance" && <AppearanceSection />}

        {tab === "privacy" && (
          <DeleteAccountSection
            busy={busy}
            exportBusy={exportBusy}
            onExportData={() => void onExportData()}
            onOpenDelete={() => {
              setDeletePassword("");
              setDeleteConfirm("");
              setShowDelete(true);
            }}
          />
        )}
      </AdminPageShell>

      <DeleteAccountModal
        showDelete={showDelete}
        deleteBusy={deleteBusy}
        deletePassword={deletePassword}
        deleteConfirm={deleteConfirm}
        onDeletePasswordChange={setDeletePassword}
        onDeleteConfirmChange={setDeleteConfirm}
        onCancelDelete={() => setShowDelete(false)}
        onConfirmDelete={() => void onDeleteAccount()}
      />
    </>
  );
}
