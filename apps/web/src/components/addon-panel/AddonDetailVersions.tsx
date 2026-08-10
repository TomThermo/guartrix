import type { AddonVersionInfo } from "@guartrix/shared";
import { Badge, Button, ListGroup, Spinner } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatBytes, formatWhen } from "../../utils";

interface Props {
  versions: AddonVersionInfo[];
  loading: boolean;
  installing: boolean;
  canUpdate: boolean;
  onInstallVersion: (versionId: string) => void;
}

function channelBadge(channel: string) {
  const normalized = channel.toLowerCase();
  if (normalized === "release") return "success";
  if (normalized === "beta") return "warning";
  if (normalized === "alpha") return "danger";
  return "secondary";
}

export function AddonDetailVersions({
  versions,
  loading,
  installing,
  canUpdate,
  onInstallVersion,
}: Props) {
  const { t } = useI18n();

  return (
    <>
      {loading && (
        <div className="text-center py-4 text-secondary">
          <Spinner size="sm" className="me-2" />
          {t("addons.loadingVersions")}
        </div>
      )}
      {!loading && versions.length === 0 && (
        <div className="text-secondary small">{t("addons.noBuildsFor", { version: "" })}</div>
      )}
      {!loading && versions.length > 0 && (
        <ListGroup variant="flush" className="border rounded">
          {versions.map((version, index) => (
            <ListGroup.Item
              key={version.versionId}
              className="d-flex justify-content-between align-items-start gap-3 flex-wrap"
            >
              <div className="min-w-0">
                <div className="fw-semibold d-flex flex-wrap align-items-center gap-1">
                  <span>{version.versionNumber}</span>
                  {index === 0 && <Badge bg="primary">{t("addons.latest")}</Badge>}
                  <Badge bg={channelBadge(version.releaseChannel)}>{version.releaseChannel}</Badge>
                </div>
                <div className="small text-secondary">
                  {version.gameVersions.slice(0, 6).join(", ")}
                  {version.gameVersions.length > 6 ? ` +${version.gameVersions.length - 6}` : ""}
                  {version.fileSize > 0 ? ` · ${formatBytes(version.fileSize)}` : ""}
                  {version.datePublished ? ` · ${formatWhen(version.datePublished)}` : ""}
                </div>
              </div>
              {canUpdate && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={installing}
                  onClick={() => onInstallVersion(version.versionId)}
                >
                  {installing ? <Spinner size="sm" /> : t("addons.install")}
                </Button>
              )}
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}
    </>
  );
}
