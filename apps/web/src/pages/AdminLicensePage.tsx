import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { PanelVersionStatus } from "@msm/shared";
import {
  Alert,
  Badge,
  Button,
  Card,
  Form,
  ProgressBar,
  Spinner,
} from "react-bootstrap";
import { api } from "../api";

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
  { id: "power", label: "Power / console" },
  { id: "user", label: "Subusers" },
  { id: "server", label: "Settings / allocations" },
  { id: "database", label: "Databases" },
  { id: "file", label: "File manager / SFTP" },
  { id: "backup", label: "Backups" },
  { id: "schedule", label: "Schedules" },
  { id: "player", label: "Players" },
  { id: "addon", label: "Addons / mods" },
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

export function AdminLicensePage() {
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

  // While this page is open, refresh from the license server every minute
  // (force validate). Background panel checks stay at ~10 minutes.
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
    <div>
      <h1 className="h3 mb-1">License</h1>
      <p className="text-secondary mb-3">
        Panel license status. Without a valid license the install runs in free
        tier: <strong>1 node</strong>, <strong>1 Minecraft server</strong>,{" "}
        <strong>10 GB disk</strong>. Activate a license to raise those caps.
      </p>

      {error && <Alert variant="danger">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}

      {version && (
        <Card
          className={`mb-3 ${
            version.belowMinimum
              ? "border-danger"
              : version.updateAvailable
                ? "border-warning"
                : "border-success"
          }`}
        >
          <Card.Body>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <span className="fw-semibold">System version</span>
              <Badge bg="dark" className="font-monospace">
                v{version.current}
              </Badge>
              {version.upToDate && !version.belowMinimum ? (
                <Badge bg="success">Up to date</Badge>
              ) : version.belowMinimum ? (
                <Badge bg="danger">Below minimum</Badge>
              ) : version.updateAvailable ? (
                <Badge bg="warning" text="dark">
                  Update available
                  {version.latest ? ` → v${version.latest}` : ""}
                </Badge>
              ) : (
                <Badge bg="secondary">Channel unreachable</Badge>
              )}
            </div>
            <p className="small text-secondary mb-0">
              Channel is published on the license server
              {version.latest ? ` (latest v${version.latest}` : ""}
              {version.minVersion ? `, min v${version.minVersion}` : ""}
              {version.latest ? ")" : ""}.
              {version.notes ? ` ${version.notes}` : ""}
            </p>
          </Card.Body>
        </Card>
      )}

      {!info ? (
        <div className="text-center py-4">
          <Spinner />
        </div>
      ) : (
        <>
          <Card className="mb-3">
            <Card.Body>
              <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                <Badge bg={statusVariant}>{info.status}</Badge>
                {info.label && <Badge bg="secondary">{info.label}</Badge>}
                <span className="text-secondary small">
                  Checked {new Date(info.checkedAt).toLocaleString()}
                </span>
              </div>
              <p className="mb-2">{info.message}</p>
              <dl className="row small mb-0">
                <dt className="col-sm-3">License server</dt>
                <dd className="col-sm-9 font-monospace">
                  {info.serverUrl}{" "}
                  <span className="text-secondary">({info.serverUrlSource})</span>
                </dd>
                <dt className="col-sm-3">Key</dt>
                <dd className="col-sm-9 font-monospace">
                  {info.keyMasked || "—"}
                </dd>
                <dt className="col-sm-3">Expires</dt>
                <dd className="col-sm-9">
                  {info.expiresAt
                    ? new Date(info.expiresAt).toLocaleString()
                    : info.status === "valid"
                      ? "Unlimited"
                      : "—"}
                </dd>
                <dt className="col-sm-3">Bound IP(s)</dt>
                <dd className="col-sm-9 font-monospace">
                  {boundList.length ? boundList.join(", ") : "unbound"}
                </dd>
                <dt className="col-sm-3">Features</dt>
                <dd className="col-sm-9">
                  {info.features == null ? (
                    <span className="text-secondary">All enabled</span>
                  ) : (
                    <div className="d-flex flex-wrap gap-1">
                      {FEATURE_GROUPS.map((g) => {
                        const enabled = info.features!.includes(g.id);
                        return (
                          <Badge
                            key={g.id}
                            bg={enabled ? "success" : "danger"}
                            className="fw-normal"
                            title={enabled ? "Enabled on this license" : "Not included"}
                          >
                            {g.label}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </dd>
              </dl>
              <div className="d-flex flex-wrap gap-2 mt-3">
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
                    <i className="fa-solid fa-trash-can me-1" />
                    Remove license
                  </Button>
                )}
              </div>
            </Card.Body>
          </Card>

          <Card className="mb-3">
            <Card.Body>
              <Card.Title className="h6 mb-1">
                {info.freeTier
                  ? "Free-tier allowance vs in use"
                  : "License allowance vs in use"}
              </Card.Title>
              <p className="text-secondary small mb-3">
                {info.freeTier
                  ? "No valid license — these free-tier caps apply until you activate one."
                  : "What this license allows on this panel, and how much you already use across all Minecraft servers."}
              </p>
              <div className="row g-3">
                <div className="col-md-3">
                  <div className="d-flex justify-content-between small mb-1">
                    <span>Nodes</span>
                    <span className="font-monospace">
                      {usage?.nodeCount ?? 0}
                      {" / "}
                      {info.maxNodes != null ? info.maxNodes : "∞"}
                    </span>
                  </div>
                  {info.maxNodes != null ? (
                    <ProgressBar
                      now={nodesPct}
                      variant={usageVariant(nodesPct)}
                      className="mb-1"
                      style={{ height: 8 }}
                    />
                  ) : (
                    <div className="text-secondary small">Unlimited nodes</div>
                  )}
                </div>
                <div className="col-md-3">
                  <div className="d-flex justify-content-between small mb-1">
                    <span>Servers</span>
                    <span className="font-monospace">
                      {usage?.serverCount ?? 0}
                      {" / "}
                      {info.maxServers != null ? info.maxServers : "∞"}
                    </span>
                  </div>
                  {info.maxServers != null ? (
                    <ProgressBar
                      now={serversPct}
                      variant={usageVariant(serversPct)}
                      className="mb-1"
                      style={{ height: 8 }}
                    />
                  ) : (
                    <div className="text-secondary small">Unlimited servers</div>
                  )}
                </div>
                <div className="col-md-3">
                  <div className="d-flex justify-content-between small mb-1">
                    <span>Total RAM</span>
                    <span className="font-monospace">
                      {formatGb(usage?.memoryUsedMb ?? 0)}
                      {" / "}
                      {info.maxMemoryMb != null
                        ? formatGb(info.maxMemoryMb)
                        : info.freeTier
                          ? "—"
                          : "∞"}
                    </span>
                  </div>
                  {info.maxMemoryMb != null ? (
                    <ProgressBar
                      now={ramPct}
                      variant={usageVariant(ramPct)}
                      className="mb-1"
                      style={{ height: 8 }}
                    />
                  ) : (
                    <div className="text-secondary small">
                      {info.freeTier
                        ? "No free-tier RAM pool cap"
                        : "Unlimited total RAM"}
                    </div>
                  )}
                </div>
                <div className="col-md-3">
                  <div className="d-flex justify-content-between small mb-1">
                    <span>{info.freeTier ? "Disk / server" : "Largest server"}</span>
                    <span className="font-monospace">
                      {info.freeTier
                        ? `≤${(info.maxDiskMb ?? 10_240) / 1024} GB`
                        : `${formatGb(usage?.maxServerMemoryMb ?? 0)} / ${
                            info.maxMemoryMbPerServer != null
                              ? `≤${formatGb(info.maxMemoryMbPerServer)}`
                              : "∞"
                          }`}
                    </span>
                  </div>
                  {info.freeTier ? (
                    <div className="text-secondary small">
                      Max {(info.maxDiskMb ?? 10_240) / 1024} GB per server
                    </div>
                  ) : info.maxMemoryMbPerServer != null ? (
                    <ProgressBar
                      now={perServerPct}
                      variant={usageVariant(perServerPct)}
                      className="mb-1"
                      style={{ height: 8 }}
                    />
                  ) : (
                    <div className="text-secondary small">
                      No per-server RAM cap
                    </div>
                  )}
                </div>
              </div>
              {info.freeTier ? (
                <Alert variant="warning" className="small mb-0 mt-3 py-2">
                  Free tier: 1 node, 1 server, 10 GB disk. Extra or over-disk
                  servers are stopped; start works only within these caps.
                </Alert>
              ) : null}
              {!info.freeTier &&
                info.maxServers == null &&
                info.maxNodes == null &&
                info.maxMemoryMb == null &&
                info.maxMemoryMbPerServer == null && (
                  <p className="small text-secondary mb-0 mt-3">
                    This license has no panel quotas set (unlimited).
                  </p>
                )}
              {info.maxMemoryMbPerServer != null &&
                (usage?.maxServerMemoryMb ?? 0) >
                  info.maxMemoryMbPerServer && (
                  <Alert variant="warning" className="small mb-0 mt-3 py-2">
                    At least one server is above the per-server license cap.
                    Lower Memory in server settings before start/restart.
                  </Alert>
                )}
            </Card.Body>
          </Card>
        </>
      )}

      <Card className="mb-3">
        <Card.Body>
          <Card.Title className="h6">License server URL</Card.Title>
          <p className="text-secondary small mb-3">
            Enter the license server URL from your Guartrix license (usually{" "}
            <code>https://license.guartrix.com</code>). Use{" "}
            <strong>Reset to default</strong> if you need to undo a custom URL
            {info?.serverUrlEnvDefault
              ? ` (default: ${info.serverUrlEnvDefault})`
              : ""}
            .
          </p>
          <Form onSubmit={(e) => void onSaveServer(e)}>
            <Form.Group className="mb-3" controlId="license-server-url">
              <Form.Label>Server URL</Form.Label>
              <Form.Control
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://license.guartrix.com"
                disabled={busy}
                autoComplete="off"
              />
            </Form.Group>
            <div className="d-flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !serverUrl.trim()}>
                Save &amp; check
              </Button>
              <Button
                type="button"
                variant="outline-secondary"
                disabled={busy}
                onClick={() => void onResetServerUrl()}
              >
                Reset to default
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body>
          <Card.Title className="h6">Change license key</Card.Title>
          <Form onSubmit={(e) => void onSaveKey(e)}>
            <Form.Group className="mb-3" controlId="license-key">
              <Form.Label>License key</Form.Label>
              <Form.Control
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="GTRX-…"
                disabled={busy}
                autoComplete="off"
              />
            </Form.Group>
            <Button type="submit" disabled={busy || !key.trim()}>
              Save &amp; validate
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}
