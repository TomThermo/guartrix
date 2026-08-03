import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { PanelVersionStatus } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  ProgressBar,
  Row,
  Spinner,
} from "react-bootstrap";
import { api } from "../api";
import { useI18n } from "../i18n/react";

interface LicenseInfo {
  valid: boolean;
  status: string;
  message: string;
  expiresAt: string | null;
  label: string | null;
  checkedAt: string;
  keyMasked: string;
  hasKey: boolean;
  serverUrl: string;
  serverUrlSource: "file" | "env" | "default";
  serverUrlEnvDefault: string;
  maxServers?: number | null;
  maxNodes?: number | null;
  maxMemoryMb?: number | null;
  maxMemoryMbPerServer?: number | null;
  maxDiskMb?: number | null;
  freeTier?: boolean;
  features?: string[] | null;
  boundIp?: string | null;
  boundIps?: string[];
  usage?: {
    serverCount: number;
    memoryUsedMb: number;
    maxServerMemoryMb: number;
    nodeCount?: number;
  };
}

const FEATURE_GROUPS: Array<{ id: string; label: string }> = [
  { id: "power", label: "Power" },
  { id: "user", label: "Subusers" },
  { id: "server", label: "Settings" },
  { id: "database", label: "Databases" },
  { id: "file", label: "Files" },
  { id: "backup", label: "Backups" },
  { id: "schedule", label: "Schedules" },
  { id: "player", label: "Players" },
  { id: "addon", label: "Addons" },
];

function formatGb(mb: number): string {
  const gb = mb / 1024;
  if (Number.isInteger(gb)) return `${gb} GB`;
  return `${(Math.round(gb * 1000) / 1000).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })} GB`;
}

function usagePct(used: number, limit: number | null | undefined): number {
  if (limit == null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 1000) / 10);
}

function usageVariant(pct: number): string {
  if (pct >= 100) return "danger";
  if (pct >= 85) return "warning";
  return "success";
}

function notifyLicenseChanged(valid?: boolean) {
  window.dispatchEvent(
    new CustomEvent("guartrix:license-changed", {
      detail: { valid },
    }),
  );
}

function Meta({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="license-meta">
      <div className="license-meta-label">{label}</div>
      <div className={`license-meta-value${mono ? " font-monospace" : ""}`}>
        {children}
      </div>
    </div>
  );
}

function UsageMeter({
  label,
  usedLabel,
  pct,
  capped,
  uncappedHint,
}: {
  label: string;
  usedLabel: string;
  pct: number;
  capped: boolean;
  uncappedHint: string;
}) {
  return (
    <div className="license-meter">
      <div className="d-flex justify-content-between align-items-baseline gap-2">
        <span className="license-meter-label">{label}</span>
        <span className="font-monospace small text-secondary text-nowrap">
          {usedLabel}
        </span>
      </div>
      {capped ? (
        <ProgressBar
          now={pct}
          variant={usageVariant(pct)}
          style={{ height: 6 }}
        />
      ) : (
        <div className="license-meter-hint">{uncappedHint}</div>
      )}
    </div>
  );
}

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

  const statusVariant =
    info?.status === "valid"
      ? "success"
      : info?.status === "unreachable"
        ? "warning"
        : "danger";

  const usage = info?.usage;
  const nodesPct = usagePct(usage?.nodeCount ?? 0, info?.maxNodes);
  const serversPct = usagePct(usage?.serverCount ?? 0, info?.maxServers);
  const ramPct = usagePct(usage?.memoryUsedMb ?? 0, info?.maxMemoryMb);
  const perServerPct = usagePct(
    usage?.maxServerMemoryMb ?? 0,
    info?.maxMemoryMbPerServer,
  );
  const boundList =
    info?.boundIps && info.boundIps.length
      ? info.boundIps
      : info?.boundIp
        ? [info.boundIp]
        : [];

  return (
    <div className="license-page">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
        <div>
          <h1 className="h4 mb-0">{t("admin.licenseTitle")}</h1>
          <p className="text-secondary small mb-0 mt-1">{t("admin.licenseSubtitle")}</p>
        </div>
        {version && (
          <div className="d-flex flex-wrap align-items-center gap-2 license-version-chip">
            <span className="small text-secondary">Panel</span>
            <Badge bg="dark" className="font-monospace">
              v{version.current}
            </Badge>
            {version.upToDate && !version.belowMinimum ? (
              <Badge bg="success">{t("common.upToDate")}</Badge>
            ) : version.belowMinimum ? (
              <Badge bg="danger">Below min{version.minVersion ? ` v${version.minVersion}` : ""}</Badge>
            ) : version.updateAvailable ? (
              <Badge bg="warning" text="dark">
                Update{version.latest ? ` → v${version.latest}` : ""}
              </Badge>
            ) : (
              <Badge bg="secondary">Channel offline</Badge>
            )}
          </div>
        )}
      </div>

      {error && (
        <Alert variant="danger" className="py-2 small" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" className="py-2 small" dismissible onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {!info ? (
        <div className="text-center py-5">
          <Spinner />
        </div>
      ) : (
        <Row className="g-3">
          <Col lg={7}>
            <section className="license-panel">
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <Badge bg={statusVariant}>{info.status}</Badge>
                  {info.freeTier && (
                    <Badge bg="warning" text="dark">
                      Free tier
                    </Badge>
                  )}
                  {info.label && <Badge bg="secondary">{info.label}</Badge>}
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline-primary"
                    disabled={busy}
                    onClick={() => void revalidate()}
                  >
                    {busy ? <Spinner size="sm" /> : "Revalidate"}
                  </Button>
                  {info.hasKey && (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      disabled={busy}
                      onClick={() => void onRemoveKey()}
                    >
                      {t("common.remove")}
                    </Button>
                  )}
                </div>
              </div>

              <p className="small mb-3">{info.message}</p>

              <div className="license-meta-grid mb-3">
                <Meta label="Key" mono>
                  {info.keyMasked || "—"}
                </Meta>
                <Meta label="Expires">
                  {info.expiresAt
                    ? new Date(info.expiresAt).toLocaleString()
                    : info.status === "valid"
                      ? t("common.unlimited")
                      : "—"}
                </Meta>
                <Meta label="Bound IP" mono>
                  {boundList.length ? boundList.join(", ") : "unbound"}
                </Meta>
                <Meta label="Checked">
                  {new Date(info.checkedAt).toLocaleString()}
                </Meta>
              </div>

              <div className="mb-1 small text-secondary">Features</div>
              <div className="d-flex flex-wrap gap-1">
                {info.features == null ? (
                  <span className="small text-secondary">All enabled</span>
                ) : (
                  FEATURE_GROUPS.map((g) => {
                    const enabled = info.features!.includes(g.id);
                    return (
                      <Badge
                        key={g.id}
                        bg={enabled ? "success" : "secondary"}
                        className={`fw-normal${enabled ? "" : " opacity-50"}`}
                        title={enabled ? "Enabled" : "Not included"}
                      >
                        {g.label}
                      </Badge>
                    );
                  })
                )}
              </div>
            </section>

            <section className="license-panel mt-3">
              <div className="d-flex align-items-baseline justify-content-between gap-2 mb-2">
                <h2 className="h6 mb-0">
                  {info.freeTier ? "Free-tier usage" : "License usage"}
                </h2>
                <span className="small text-secondary">Allowance vs in use</span>
              </div>

              <div className="license-meters">
                <UsageMeter
                  label="Nodes"
                  usedLabel={`${usage?.nodeCount ?? 0} / ${info.maxNodes != null ? info.maxNodes : "∞"}`}
                  pct={nodesPct}
                  capped={info.maxNodes != null}
                  uncappedHint={t("common.unlimited")}
                />
                <UsageMeter
                  label="Servers"
                  usedLabel={`${usage?.serverCount ?? 0} / ${info.maxServers != null ? info.maxServers : "∞"}`}
                  pct={serversPct}
                  capped={info.maxServers != null}
                  uncappedHint={t("common.unlimited")}
                />
                <UsageMeter
                  label="Total RAM"
                  usedLabel={`${formatGb(usage?.memoryUsedMb ?? 0)} / ${
                    info.maxMemoryMb != null
                      ? formatGb(info.maxMemoryMb)
                      : info.freeTier
                        ? "—"
                        : "∞"
                  }`}
                  pct={ramPct}
                  capped={info.maxMemoryMb != null}
                  uncappedHint={info.freeTier ? "No RAM pool cap" : t("common.unlimited")}
                />
                <UsageMeter
                  label={info.freeTier ? "Disk / server" : "Largest server"}
                  usedLabel={
                    info.freeTier
                      ? `≤${(info.maxDiskMb ?? 10_240) / 1024} GB`
                      : `${formatGb(usage?.maxServerMemoryMb ?? 0)} / ${
                          info.maxMemoryMbPerServer != null
                            ? `≤${formatGb(info.maxMemoryMbPerServer)}`
                            : "∞"
                        }`
                  }
                  pct={info.freeTier ? 0 : perServerPct}
                  capped={!info.freeTier && info.maxMemoryMbPerServer != null}
                  uncappedHint={
                    info.freeTier
                      ? `Max ${(info.maxDiskMb ?? 10_240) / 1024} GB`
                      : "No per-server cap"
                  }
                />
              </div>

              {info.freeTier && (
                <Alert variant="warning" className="small mb-0 mt-3 py-2">
                  Extra or over-disk servers are stopped until you activate a
                  license.
                </Alert>
              )}
              {!info.freeTier &&
                info.maxMemoryMbPerServer != null &&
                (usage?.maxServerMemoryMb ?? 0) >
                  info.maxMemoryMbPerServer && (
                  <Alert variant="warning" className="small mb-0 mt-3 py-2">
                    At least one server is above the per-server RAM cap. Lower
                    Memory in server settings before start/restart.
                  </Alert>
                )}
            </section>
          </Col>

          <Col lg={5}>
            <section className="license-panel">
              <h2 className="h6 mb-2">Activate key</h2>
              <Form onSubmit={(e) => void onSaveKey(e)}>
                <Form.Control
                  className="mb-2 font-monospace"
                  size="sm"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="GTRX-…"
                  disabled={busy}
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="w-100"
                  disabled={busy || !key.trim()}
                >
                  Save &amp; validate
                </Button>
              </Form>
            </section>

            <section className="license-panel mt-3">
              <h2 className="h6 mb-1">License server</h2>
              <p className="small text-secondary mb-2">
                Source: <code>{info.serverUrlSource}</code>
                {info.serverUrlEnvDefault
                  ? ` · default ${info.serverUrlEnvDefault}`
                  : ""}
              </p>
              <Form onSubmit={(e) => void onSaveServer(e)}>
                <Form.Control
                  className="mb-2 font-monospace"
                  size="sm"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://license.guartrix.com"
                  disabled={busy}
                  autoComplete="off"
                />
                <div className="d-flex gap-2">
                  <Button
                    type="submit"
                    size="sm"
                    className="flex-grow-1"
                    disabled={busy || !serverUrl.trim()}
                  >
                    Save &amp; check
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-secondary"
                    disabled={busy}
                    onClick={() => void onResetServerUrl()}
                  >
                    Reset
                  </Button>
                </div>
              </Form>
            </section>
          </Col>
        </Row>
      )}
    </div>
  );
}
