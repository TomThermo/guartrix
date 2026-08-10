import { useCallback, useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Alert, Nav } from "react-bootstrap";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";
import { AdminPageShell } from "../../components/admin/AdminPageShell";
import { AccessSection } from "./AccessSection";
import { AppearanceSection } from "./AppearanceSection";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { ProfileSection } from "./ProfileSection";
import { PushNotificationsSection } from "./PushNotificationsSection";
import { TwoFactorSection, type TwoFactorStatus } from "./TwoFactorSection";

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
  const { user, authenticated } = useAuth();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseAccountTab(searchParams.get("tab"));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState<TwoFactorStatus | null>(null);

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

  const onStatusChange = useCallback((status: TwoFactorStatus) => {
    setTwoFactor(status);
  }, []);

  useEffect(() => {
    void api
      .getTwoFactor()
      .then((s) => setTwoFactor({ enabled: s.enabled, required: s.required }))
      .catch(() => undefined);
  }, []);

  if (!authenticated) return <Navigate to="/login" replace />;

  return (
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
        twoFactor?.required && !twoFactor.enabled ? (
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

      {tab === "profile" && <ProfileSection onNotice={setNotice} onError={setError} />}
      {tab === "security" && (
        <TwoFactorSection
          onNotice={setNotice}
          onError={setError}
          onStatusChange={onStatusChange}
        />
      )}
      {tab === "access" && <AccessSection onError={setError} />}
      {tab === "notifications" && (
        <PushNotificationsSection onNotice={setNotice} onError={setError} />
      )}
      {tab === "appearance" && <AppearanceSection />}
      {tab === "privacy" && <DeleteAccountSection onNotice={setNotice} onError={setError} />}
    </AdminPageShell>
  );
}
