import type { ServerType } from "@msm/shared";
import { Button, Spinner } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export function CreateServerSubmitButton({
  mode,
  busy,
  disabled,
  type,
}: {
  mode: "create" | "import";
  busy: boolean;
  disabled: boolean;
  type: ServerType;
}) {
  const { t } = useI18n();
  if (mode === "create") {
    return (
      <Button type="submit" variant="primary" disabled={disabled}>
        {busy ? (
          <>
            <Spinner size="sm" className="me-2" />
            {type === "FORGE" || type === "NEOFORGE"
              ? t("createServer.installing")
              : t("createServer.creating")}
          </>
        ) : (
          <>
            <i className="fa-solid fa-download me-2" aria-hidden />
            {t("createServer.create")}
          </>
        )}
      </Button>
    );
  }
  return (
    <Button type="submit" variant="primary" disabled={disabled}>
      {busy ? (
        <>
          <Spinner size="sm" className="me-2" />
          {t("createServer.importBusy")}
        </>
      ) : (
        <>
          <i className="fa-solid fa-file-import me-2" aria-hidden />
          {t("createServer.import")}
        </>
      )}
    </Button>
  );
}
