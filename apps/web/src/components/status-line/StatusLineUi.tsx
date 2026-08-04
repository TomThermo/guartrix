import { useState } from "react";
import { Badge } from "react-bootstrap";
import { copyText } from "../../utils";
import { percentVariant } from "./status-line-utils";

export function HealthDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`d-inline-block rounded-circle me-2 ${ok ? "bg-success" : "bg-danger"}`}
      style={{ width: "0.6rem", height: "0.6rem", flex: "0 0 auto" }}
    />
  );
}

export function CopyableIp({ ip }: { ip: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-link p-0 text-decoration-none font-monospace"
      title="Copy IP"
      onClick={() => {
        void copyText(ip).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      {ip}{" "}
      <i className={`fa-solid ${copied ? "fa-check text-success" : "fa-copy"} ms-1 small`} />
    </button>
  );
}

export function MiniBar({ percent, width = 64 }: { percent: number; width?: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className="progress d-inline-block align-middle"
      style={{ width, height: "0.4rem" }}
      title={`${clamped.toFixed(1)}%`}
    >
      <div
        className={`progress-bar bg-${percentVariant(clamped)}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function RoleBadge({ children }: { children: string }) {
  return (
    <Badge bg="light" text="dark" className="border fw-normal">
      {children}
    </Badge>
  );
}
