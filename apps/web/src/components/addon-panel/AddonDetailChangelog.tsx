import type { AddonVersionInfo } from "@guartrix/shared";
import { Badge, Spinner } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { formatWhen } from "../../utils";
import { SimpleMarkdown } from "./simpleMarkdown";

interface Props {
  versions: AddonVersionInfo[];
  loading: boolean;
}

function channelBadge(channel: string) {
  const normalized = channel.toLowerCase();
  if (normalized === "release") return "success";
  if (normalized === "beta") return "warning";
  if (normalized === "alpha") return "danger";
  return "secondary";
}

export function AddonDetailChangelog({ versions, loading }: Props) {
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
        <div className="text-secondary small">{t("addons.noChangelog")}</div>
      )}
      {!loading &&
        versions.map((version) => (
          <div key={version.versionId} className="addon-changelog-entry mb-4">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <span className="fw-semibold">{version.versionNumber}</span>
              <Badge bg={channelBadge(version.releaseChannel)}>{version.releaseChannel}</Badge>
              {version.datePublished && (
                <span className="small text-secondary">{formatWhen(version.datePublished)}</span>
              )}
            </div>
            {version.changelog?.trim() ? (
              <SimpleMarkdown text={version.changelog} />
            ) : (
              <div className="small text-secondary">{t("addons.noChangelogEntry")}</div>
            )}
          </div>
        ))}
    </>
  );
}
