interface Props {
  /** Main message shown to the user (usually already translated). */
  message: string;
  /** Optional font-awesome icon class, e.g. "fa-solid fa-box-open". */
  icon?: string;
  /** Extra classes for the wrapping div. */
  className?: string;
}

/** Shared "nothing here yet" placeholder for lists/tables/panels. */
export function EmptyState({ message, icon, className }: Props) {
  return (
    <div className={`text-secondary small text-center py-3 ${className ?? ""}`}>
      {icon && <i className={`${icon} me-2`} />}
      {message}
    </div>
  );
}
