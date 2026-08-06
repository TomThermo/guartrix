import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Alert, Spinner } from "react-bootstrap";

interface Props {
  title: string;
  subtitle?: string;
  icon?: string;
  backTo?: string;
  backLabel?: string;
  extraHeader?: ReactNode;
  error?: string | null;
  notice?: string | null;
  warning?: ReactNode;
  onDismissError?: () => void;
  onDismissNotice?: () => void;
  loading?: boolean;
  loadingLabel?: string;
  children?: ReactNode;
}

export function AdminPageShell({
  title,
  subtitle,
  icon = "fa-gears",
  backTo,
  backLabel = "Back",
  extraHeader,
  error,
  notice,
  warning,
  onDismissError,
  onDismissNotice,
  loading = false,
  loadingLabel = "Loading…",
  children,
}: Props) {
  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div className="admin-page__identity">
          <span className="admin-page__icon" aria-hidden>
            <i className={`fa-solid ${icon}`} />
          </span>
          <div className="min-w-0">
            <h1 className="admin-page__title">{title}</h1>
            {subtitle && <p className="admin-page__subtitle">{subtitle}</p>}
          </div>
        </div>
        <div className="admin-page__actions">
          {extraHeader}
          {backTo && (
            <Link to={backTo} className="btn btn-sm btn-outline-secondary">
              <i className="fa-solid fa-arrow-left" aria-hidden />
              <span className="btn-label">{backLabel}</span>
            </Link>
          )}
        </div>
      </header>

      {error && (
        <Alert variant="danger" dismissible onClose={onDismissError}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert variant="success" dismissible onClose={onDismissNotice}>
          {notice}
        </Alert>
      )}
      {warning}

      {loading ? (
        <div className="admin-page__loading">
          <Spinner size="sm" className="me-2" />
          {loadingLabel}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

export function AdminPanelCard({
  title,
  icon,
  children,
  className = "",
}: {
  title?: string;
  icon?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`admin-panel-card ${className}`.trim()}>
      {title && (
        <div className="admin-panel-card__head">
          {icon && <i className={`fa-solid ${icon}`} aria-hidden />}
          <h2 className="admin-panel-card__title">{title}</h2>
        </div>
      )}
      <div className="admin-panel-card__body">{children}</div>
    </section>
  );
}

export function AdminInsetCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`admin-inset-card ${className}`.trim()}>{children}</div>;
}
