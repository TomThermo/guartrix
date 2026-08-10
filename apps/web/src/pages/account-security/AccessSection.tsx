import { Col, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";
import { ApiKeysPanel } from "../../components/ApiKeysPanel";
import { AppPasswordsPanel } from "../../components/AppPasswordsPanel";
import { AdminPanelCard } from "../../components/admin/AdminPageShell";

type Props = {
  onError: (msg: string | null) => void;
};

export function AccessSection({ onError }: Props) {
  const { t } = useI18n();

  return (
    <Row className="g-4 mb-4">
      <Col lg={6}>
        <AdminPanelCard title={t("account.sftpAppPasswords")} icon="fa-folder-open">
          <AppPasswordsPanel onError={onError} />
        </AdminPanelCard>
      </Col>
      <Col lg={6}>
        <AdminPanelCard title={t("apiKeys.title")} icon="fa-key">
          <ApiKeysPanel embedded onError={onError} />
        </AdminPanelCard>
      </Col>
    </Row>
  );
}
