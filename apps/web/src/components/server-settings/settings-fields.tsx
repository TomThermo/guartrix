import type { ReactNode } from "react";
import { Form } from "react-bootstrap";
import { useI18n } from "../../i18n/react";

export type CategoryId = "general" | "world" | "gameplay" | "network" | "performance" | "startup";

/** Labels from `settings.${id}`; hints from `settings.hint*`. */
export const CATEGORIES: { id: CategoryId; hintKey: string; icon: string }[] = [
  { id: "general", hintKey: "settings.hintGeneral", icon: "fa-sliders" },
  { id: "world", hintKey: "settings.hintWorld", icon: "fa-globe" },
  { id: "gameplay", hintKey: "settings.hintGameplay", icon: "fa-gamepad" },
  { id: "network", hintKey: "settings.hintNetwork", icon: "fa-shield-halved" },
  { id: "performance", hintKey: "settings.hintPerformance", icon: "fa-gauge-high" },
  { id: "startup", hintKey: "settings.hintStartup", icon: "fa-terminal" },
];

export function bool(v: string | undefined, fallback = false): string {
  if (v === "true" || v === "false") return v;
  return fallback ? "true" : "false";
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Form.Group className="settings-field">
      <div className="settings-field-head">
        <Form.Label className="settings-field-label">{label}</Form.Label>
        <div className="settings-field-hint">{hint || "\u00A0"}</div>
      </div>
      {children}
    </Form.Group>
  );
}

export function BoolSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Form.Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="true">{t("common.enabled")}</option>
      <option value="false">{t("common.disabled")}</option>
    </Form.Select>
  );
}
