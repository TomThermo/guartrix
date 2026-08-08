import { Spinner } from "react-bootstrap";
import { useI18n } from "../i18n/react";

interface Props {
  /** Override the default "Loading…" text. */
  message?: string;
  /** Extra classes for the wrapping div. */
  className?: string;
  /** Spinner size — small fits inline rows/cards, default fits a whole tab. */
  size?: "sm" | undefined;
  /** Vertical padding preset; use "sm" for compact rows (e.g. inside a table). */
  py?: "sm" | "md";
}

/** Shared inline loading indicator for tab/panel bodies while data is fetched. */
export function TabLoading({ message, className, size = "sm", py = "md" }: Props) {
  const { t } = useI18n();
  return (
    <div
      className={`text-secondary text-center ${py === "sm" ? "py-3" : "py-4"} ${className ?? ""}`}
    >
      <Spinner animation="border" size={size} className="me-2" />
      {message ?? t("common.loading")}…
    </div>
  );
}
