import type { KeyboardEvent } from "react";

export function ServerDetailStatChip({
  icon,
  label,
  title,
  tone = "neutral",
  onClick,
  onKeyDown,
}: {
  icon: string;
  label: string;
  title?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}) {
  const interactive = Boolean(onClick);
  return (
    <span
      className={`server-detail-stat server-detail-stat--${tone}${
        interactive ? " is-clickable" : ""
      }`}
      title={title}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <i className={`fa-solid ${icon}`} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
