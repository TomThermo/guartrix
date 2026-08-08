import { ProgressBar } from "react-bootstrap";
import { usageVariant } from "./licenseShared";

export function UsageMeter({
  label,
  usedLabel,
  pct,
  capped,
  uncappedHint,
}: {
  label: string;
  usedLabel: string;
  pct: number;
  capped: boolean;
  uncappedHint: string;
}) {
  return (
    <div className="license-meter">
      <div className="d-flex justify-content-between align-items-baseline gap-2">
        <span className="license-meter-label">{label}</span>
        <span className="font-monospace small text-secondary text-nowrap">{usedLabel}</span>
      </div>
      {capped ? (
        <ProgressBar now={pct} variant={usageVariant(pct)} style={{ height: 6 }} />
      ) : (
        <div className="license-meter-hint">{uncappedHint}</div>
      )}
    </div>
  );
}
