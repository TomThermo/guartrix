import { Alert, Button } from "react-bootstrap";
import { useI18n } from "../../../i18n/react";
import { copyText } from "../../../utils";

/** Optional one-shot token banner used by the nodes page. */
export function NodeTokenAlert({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const { t } = useI18n();
  return (
    <Alert variant="warning" dismissible onClose={onDismiss}>
      <div className="fw-semibold mb-1">Daemon token</div>
      <code className="user-break user-select-all">{token}</code>
      <div className="mt-2">
        <Button size="sm" variant="outline-dark" onClick={() => void copyText(token)}>
          {t("common.copy")} token
        </Button>
      </div>
    </Alert>
  );
}
