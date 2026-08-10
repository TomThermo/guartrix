import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PanelVersionStatus } from "@guartrix/shared";
import { Badge, Col, Row } from "react-bootstrap";
import { api } from "../../api";
import { AdminPageShell } from "../../components/admin/AdminPageShell";
import { useI18n } from "../../i18n/react";
import { LicenseActivateForm, LicenseServerForm } from "./LicenseForms";
import { LicenseStatusCard } from "./LicenseStatusCard";
import { LicenseUsagePanel } from "./LicenseUsagePanel";
import { notifyLicenseChanged, type LicenseInfo } from "./licenseShared";

export function AdminLicensePage() {
  const { t } = useI18n();
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const [version, setVersion] = useState<PanelVersionStatus | null>(null);
  const [key, setKey] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [data, ver] = await Promise.all([
        api.getAdminLicense(),
        api.getAdminVersion().catch(() => null),
      ]);
      setInfo(data);
      setServerUrl(data.serverUrl);
      setVersion(ver);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load license");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function revalidate() {
    setBusy(true);
    setNotice(null);
    try {
      const data = await api.revalidateAdminLicense();
      setInfo(data);
      setServerUrl(data.serverUrl);
      setNotice("License revalidated.");
      notifyLicenseChanged(data.valid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revalidate failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveKey(e: FormEvent) {
    e.preventDefault();
    if (!key.trim()) {
      setError("Enter a license key");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api.setAdminLicense(key.trim());
      setInfo(data);
      setServerUrl(data.serverUrl);
      setKey("");
      setNotice(
        data.valid
          ? "License key saved and validated."
          : `License saved but not valid: ${data.message}`,
      );
      notifyLicenseChanged(data.valid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveServer(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api.setAdminLicenseServerUrl(serverUrl.trim() || null);
      setInfo(data);
      setServerUrl(data.serverUrl);
      setNotice(
        data.serverUrlSource === "file"
          ? `License server URL saved: ${data.serverUrl}`
          : `Using default/env URL: ${data.serverUrl}`,
      );
      notifyLicenseChanged(data.valid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save server URL failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveKey() {
    if (
      !window.confirm(
        "Remove the license key? The panel drops to the free tier (1 node, 1 server, 10 GB disk) and servers above those caps are stopped.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api.deleteAdminLicense();
      setInfo(data);
      setServerUrl(data.serverUrl);
      setNotice("License key removed — free tier is now active.");
      notifyLicenseChanged(data.valid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResetServerUrl() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api.setAdminLicenseServerUrl(null);
      setInfo(data);
      setServerUrl(data.serverUrl);
      setNotice(`Reset to ${data.serverUrl} (${data.serverUrlSource})`);
      notifyLicenseChanged(data.valid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageShell
      title={t("admin.licenseTitle")}
      subtitle={t("admin.licenseSubtitle")}
      icon="fa-key"
      error={error}
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      loading={!info}
      extraHeader={
        version ? (
          <div className="d-flex flex-wrap align-items-center gap-2 license-version-chip">
            <span className="small text-secondary">Panel</span>
            <Badge bg="dark" className="font-monospace">
              v{version.current}
            </Badge>
            {version.upToDate && !version.belowMinimum ? (
              <Badge bg="success">{t("common.upToDate")}</Badge>
            ) : version.belowMinimum ? (
              <Badge bg="danger">
                Below min{version.minVersion ? ` v${version.minVersion}` : ""}
              </Badge>
            ) : version.updateAvailable ? (
              <Badge bg="warning" text="dark">
                Update{version.latest ? ` → v${version.latest}` : ""}
              </Badge>
            ) : (
              <Badge bg="secondary">Channel offline</Badge>
            )}
          </div>
        ) : null
      }
    >
      {info && (
        <div className="license-page">
          <Row className="g-3">
            <Col lg={7}>
              <LicenseStatusCard
                info={info}
                busy={busy}
                onRevalidate={() => void revalidate()}
                onRemoveKey={() => void onRemoveKey()}
              />
              <LicenseUsagePanel info={info} />
            </Col>
            <Col lg={5}>
              <LicenseActivateForm
                keyValue={key}
                onKeyChange={setKey}
                busy={busy}
                onSubmit={(e) => void onSaveKey(e)}
              />
              <LicenseServerForm
                info={info}
                serverUrl={serverUrl}
                onServerUrlChange={setServerUrl}
                busy={busy}
                onSubmit={(e) => void onSaveServer(e)}
                onReset={() => void onResetServerUrl()}
              />
            </Col>
          </Row>
        </div>
      )}
    </AdminPageShell>
  );
}
