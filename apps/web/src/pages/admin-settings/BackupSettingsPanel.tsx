import { BACKUP_KEEP_COUNT_PRESETS } from "@msm/shared";
import { Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export type BackupSettingsPanelProps = {
  defaultBackupKeepCount: number;
  onDefaultBackupKeepCountChange: (value: number) => void;
  backupOffsiteCmd: string;
  onBackupOffsiteCmdChange: (value: string) => void;
};

export function BackupSettingsPanel({
  defaultBackupKeepCount,
  onDefaultBackupKeepCountChange,
  backupOffsiteCmd,
  onBackupOffsiteCmdChange,
}: BackupSettingsPanelProps) {
  const { t } = useI18n();

  return (
    <Row className="g-3">
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.defaultBackupKeepCount")}</Form.Label>
          <Form.Select
            value={defaultBackupKeepCount}
            onChange={(e) =>
              onDefaultBackupKeepCountChange(Number(e.target.value))
            }
          >
            {BACKUP_KEEP_COUNT_PRESETS.map((n) => (
              <option key={n} value={n}>
                {t("backups.backupsCount", { n })}
              </option>
            ))}
          </Form.Select>
          <Form.Text muted>{t("adminSettings.defaultBackupKeepCountHelp")}</Form.Text>
        </Form.Group>
      </Col>
      <Col xs={12}>
        <Form.Group>
          <Form.Label>{t("adminSettings.backupOffsiteCmd")}</Form.Label>
          <Form.Control
            value={backupOffsiteCmd}
            onChange={(e) => onBackupOffsiteCmdChange(e.target.value)}
            placeholder='rclone copy "{path}" b2:bucket/{serverId}/'
            className="font-monospace"
          />
          <Form.Text muted>{t("adminSettings.backupOffsiteCmdHelp")}</Form.Text>
        </Form.Group>
      </Col>
      <Col xs={12}>
        <p className="small text-secondary mb-0">{t("adminSettings.backupEncryptionNote")}</p>
      </Col>
    </Row>
  );
}
