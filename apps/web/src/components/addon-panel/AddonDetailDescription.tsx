import type { AddonProjectDetails } from "@msm/shared";
import { Stack } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { SimpleMarkdown } from "./simpleMarkdown";

interface Props {
  project: AddonProjectDetails;
}

export function AddonDetailDescription({ project }: Props) {
  const { t } = useI18n();

  return (
    <>
      <h3 className="h6">{t("addons.about")}</h3>
      <SimpleMarkdown text={project.body} />
      <Stack direction="horizontal" gap={2} className="flex-wrap mt-3">
        <a
          className="btn btn-sm btn-outline-secondary"
          href={project.modrinthUrl}
          target="_blank"
          rel="noreferrer"
        >
          <i className="fa-solid fa-arrow-up-right-from-square me-1" />
          Modrinth
        </a>
        {project.sourceUrl && (
          <a
            className="btn btn-sm btn-outline-secondary"
            href={project.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("addons.source")}
          </a>
        )}
        {project.issuesUrl && (
          <a
            className="btn btn-sm btn-outline-secondary"
            href={project.issuesUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("addons.issues")}
          </a>
        )}
        {project.wikiUrl && (
          <a
            className="btn btn-sm btn-outline-secondary"
            href={project.wikiUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("addons.wiki")}
          </a>
        )}
        {project.discordUrl && (
          <a
            className="btn btn-sm btn-outline-secondary"
            href={project.discordUrl}
            target="_blank"
            rel="noreferrer"
          >
            Discord
          </a>
        )}
      </Stack>
    </>
  );
}
