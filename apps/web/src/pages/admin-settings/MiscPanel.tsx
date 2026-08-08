import { Alert, Col, Form, Row } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export type MiscPanelProps = {
  debugMode: boolean;
  onDebugModeChange: (value: boolean) => void;
  unitPrefix: "binary" | "decimal";
  onUnitPrefixChange: (value: "binary" | "decimal") => void;
  navigationType: "sidebar" | "topbar" | "mixed";
  onNavigationTypeChange: (value: "sidebar" | "topbar" | "mixed") => void;
  displayWidth: "xl" | "2xl" | "full";
  onDisplayWidthChange: (value: "xl" | "2xl" | "full") => void;
};

export function MiscPanel({
  debugMode,
  onDebugModeChange,
  unitPrefix,
  onUnitPrefixChange,
  navigationType,
  onNavigationTypeChange,
  displayWidth,
  onDisplayWidthChange,
}: MiscPanelProps) {
  const { t } = useI18n();

  return (
    <Row className="g-3">
      <Col xs={12}>
        <Form.Check
          type="switch"
          id="debug-mode"
          label={t("adminSettings.debugMode")}
          checked={debugMode}
          onChange={(e) => onDebugModeChange(e.target.checked)}
        />
        <Form.Text muted className="d-block">
          {t("adminSettings.debugModeHelp")}
        </Form.Text>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.unitPrefix")}</Form.Label>
          <Form.Select
            value={unitPrefix}
            onChange={(e) =>
              onUnitPrefixChange(e.target.value === "decimal" ? "decimal" : "binary")
            }
          >
            <option value="decimal">{t("adminSettings.unitPrefixDecimal")}</option>
            <option value="binary">{t("adminSettings.unitPrefixBinary")}</option>
          </Form.Select>
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.navigationType")}</Form.Label>
          <Form.Select
            value={navigationType}
            onChange={(e) => {
              const v = e.target.value;
              onNavigationTypeChange(
                v === "sidebar" || v === "topbar" || v === "mixed" ? v : "mixed",
              );
            }}
          >
            <option value="sidebar">{t("adminSettings.navSidebar")}</option>
            <option value="topbar">{t("adminSettings.navTopbar")}</option>
            <option value="mixed">{t("adminSettings.navMixed")}</option>
          </Form.Select>
          <Form.Text muted>{t("adminSettings.navigationTypeHelp")}</Form.Text>
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group>
          <Form.Label>{t("adminSettings.displayWidth")}</Form.Label>
          <Form.Select
            value={displayWidth}
            onChange={(e) => {
              const v = e.target.value;
              onDisplayWidthChange(v === "2xl" || v === "full" || v === "xl" ? v : "xl");
            }}
          >
            <option value="xl">XL</option>
            <option value="2xl">2XL</option>
            <option value="full">{t("adminSettings.displayWidthFull")}</option>
          </Form.Select>
        </Form.Group>
      </Col>
      <Col xs={12}>
        <Alert variant="secondary" className="mb-0 small">
          {t("adminSettings.miscDeferredNote")}
        </Alert>
      </Col>
    </Row>
  );
}
