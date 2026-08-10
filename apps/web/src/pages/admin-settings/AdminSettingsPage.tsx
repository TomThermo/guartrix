import { Navigate } from "react-router-dom";
import { Alert, Button, Form, Nav, Spinner } from "react-bootstrap";
import { useAuth } from "../../auth";
import { AdminPageShell, AdminPanelCard } from "../../components/admin/AdminPageShell";
import { AlertsPanel } from "./AlertsPanel";
import { BackupSettingsPanel } from "./BackupSettingsPanel";
import { GeneralPanel } from "./GeneralPanel";
import { GoLivePanel } from "./GoLivePanel";
import { MailPanel } from "./MailPanel";
import { MiscPanel } from "./MiscPanel";
import { SETTINGS_TABS, useAdminSettings, type SettingsTab } from "./useAdminSettings";

export function AdminSettingsPage() {
  const { user, authenticated } = useAuth();
  const s = useAdminSettings();

  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;

  return (
    <AdminPageShell
      title={s.t("adminSettings.title")}
      subtitle={s.t("adminSettings.subtitle")}
      icon="fa-gears"
      error={s.error}
      notice={s.notice}
      onDismissError={() => s.setError(null)}
      onDismissNotice={() => s.setNotice(null)}
      warning={
        s.restartRequired ? (
          <Alert variant="warning">{s.t("adminSettings.restartBanner")}</Alert>
        ) : null
      }
      loading={s.loading}
      loadingLabel={s.t("common.loading")}
    >
      <Form onSubmit={s.onSave} className="admin-settings">
        <Nav
          variant="pills"
          className="admin-settings__tabs gap-1 mb-3 flex-wrap"
          activeKey={s.tab}
          onSelect={(k) => k && s.setTab(k as SettingsTab)}
        >
          {SETTINGS_TABS.map((item) => (
            <Nav.Item key={item.id}>
              <Nav.Link eventKey={item.id}>
                <i className={`fa-solid ${item.icon} me-1`} aria-hidden />
                {s.t(item.labelKey)}
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>

        <p className="small text-secondary mb-3">{s.t(`adminSettings.intro.${s.tab}`)}</p>

        <div className="admin-settings-content">
          <AdminPanelCard>
            {s.tab === "general" && (
              <GeneralPanel
                appName={s.appName}
                onAppNameChange={s.setAppName}
                appLogo={s.appLogo}
                onAppLogoChange={s.setAppLogo}
                appFavicon={s.appFavicon}
                onAppFaviconChange={s.setAppFavicon}
                publicHost={s.publicHost}
                onPublicHostChange={s.setPublicHost}
                publicBaseUrl={s.publicBaseUrl}
                onPublicBaseUrlChange={s.setPublicBaseUrl}
                registrationEnabled={s.registrationEnabled}
                onRegistrationEnabledChange={s.setRegistrationEnabled}
                defaultMaxServers={s.defaultMaxServers}
                onDefaultMaxServersChange={s.setDefaultMaxServers}
                defaultMaxMemoryMb={s.defaultMaxMemoryMb}
                onDefaultMaxMemoryMbChange={s.setDefaultMaxMemoryMb}
                defaultMaxDatabases={s.defaultMaxDatabases}
                onDefaultMaxDatabasesChange={s.setDefaultMaxDatabases}
                cloudflareDomain={s.cloudflareDomain}
                onCloudflareDomainChange={s.setCloudflareDomain}
                cloudflareZoneId={s.cloudflareZoneId}
                onCloudflareZoneIdChange={s.setCloudflareZoneId}
                cloudflareApiToken={s.cloudflareApiToken}
                onCloudflareApiTokenChange={s.setCloudflareApiToken}
                cloudflareApiTokenSet={s.cloudflareApiTokenSet}
              />
            )}

            {s.tab === "mail" && (
              <MailPanel
                mailFrom={s.mailFrom}
                onMailFromChange={s.setMailFrom}
                smtpHost={s.smtpHost}
                onSmtpHostChange={s.setSmtpHost}
                smtpPort={s.smtpPort}
                onSmtpPortChange={s.setSmtpPort}
                smtpSecure={s.smtpSecure}
                onSmtpSecureChange={s.setSmtpSecure}
                smtpStartTls={s.smtpStartTls}
                onSmtpStartTlsChange={s.setSmtpStartTls}
                smtpUser={s.smtpUser}
                onSmtpUserChange={s.setSmtpUser}
                smtpPass={s.smtpPass}
                onSmtpPassChange={s.setSmtpPass}
                smtpPassSet={s.smtpPassSet}
                smtpConfigured={s.smtpConfigured}
                busy={s.busy}
                onTestMail={() => void s.onTestMail()}
              />
            )}

            {s.tab === "backup" && (
              <BackupSettingsPanel
                defaultBackupKeepCount={s.defaultBackupKeepCount}
                onDefaultBackupKeepCountChange={s.setDefaultBackupKeepCount}
                backupOffsiteCmd={s.backupOffsiteCmd}
                onBackupOffsiteCmdChange={s.setBackupOffsiteCmd}
              />
            )}

            {s.tab === "misc" && (
              <MiscPanel
                debugMode={s.debugMode}
                onDebugModeChange={s.setDebugMode}
                unitPrefix={s.unitPrefix}
                onUnitPrefixChange={s.setUnitPrefix}
                navigationType={s.navigationType}
                onNavigationTypeChange={s.setNavigationType}
                displayWidth={s.displayWidth}
                onDisplayWidthChange={s.setDisplayWidth}
              />
            )}

            {s.tab === "alerts" && (
              <AlertsPanel
                activityWebhookUrl={s.activityWebhookUrl}
                onActivityWebhookUrlChange={s.setActivityWebhookUrl}
                alertEmail={s.alertEmail}
                onAlertEmailChange={s.setAlertEmail}
                activityAlertMute={s.activityAlertMute}
                onActivityAlertMuteChange={s.setActivityAlertMute}
              />
            )}

            {s.tab === "golive" && (
              <GoLivePanel
                readiness={s.readiness}
                loading={s.readinessLoading}
                busy={s.busy}
                onRefresh={() => void s.refreshReadiness()}
                slaRestoreDrillAt={s.slaRestoreDrillAt}
                onSlaRestoreDrillAtChange={s.setSlaRestoreDrillAt}
                slaCapacityReviewAt={s.slaCapacityReviewAt}
                onSlaCapacityReviewAtChange={s.setSlaCapacityReviewAt}
                slaSecretRotationAt={s.slaSecretRotationAt}
                onSlaSecretRotationAtChange={s.setSlaSecretRotationAt}
                slaIncidentRunbookAck={s.slaIncidentRunbookAck}
                onSlaIncidentRunbookAckChange={s.setSlaIncidentRunbookAck}
                slaPentestAck={s.slaPentestAck}
                onSlaPentestAckChange={s.setSlaPentestAck}
                onGoToTab={s.onGoToTab}
              />
            )}

            <div className="admin-form-actions">
              <Button type="submit" variant="primary" disabled={s.busy}>
                {s.busy ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    {s.t("common.saving")}
                  </>
                ) : (
                  s.t("common.save")
                )}
              </Button>
            </div>
          </AdminPanelCard>
        </div>
      </Form>
    </AdminPageShell>
  );
}
