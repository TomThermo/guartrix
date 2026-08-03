import type { ReactNode } from "react";
import { Form } from "react-bootstrap";

export type CategoryId =
  | "general"
  | "world"
  | "gameplay"
  | "network"
  | "performance"
  | "startup";

export const CATEGORIES: { id: CategoryId; label: string; hint: string; icon: string }[] = [
  {
    id: "general",
    label: "General",
    hint: "Name, MOTD, icon, players, authentication",
    icon: "fa-sliders",
  },
  {
    id: "world",
    label: "World",
    hint: "Seed, difficulty, gamemode, dimensions",
    icon: "fa-globe",
  },
  {
    id: "gameplay",
    label: "Gameplay",
    hint: "PvP, spawn, flight, command blocks",
    icon: "fa-gamepad",
  },
  {
    id: "network",
    label: "Access",
    hint: "Online-mode, resource pack, proxy",
    icon: "fa-shield-halved",
  },
  {
    id: "performance",
    label: "Performance",
    hint: "RAM, view distance, simulation",
    icon: "fa-gauge-high",
  },
  {
    id: "startup",
    label: "Start Configuration",
    hint: "Java, startup command, and extra host mounts",
    icon: "fa-terminal",
  },
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
  return (
    <Form.Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="true">Enabled</option>
      <option value="false">Disabled</option>
    </Form.Select>
  );
}
