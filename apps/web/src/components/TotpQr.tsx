import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Client-side QR for otpauth:// URLs — secret never leaves the browser. */
export function TotpQr({ value, size = 200 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    void QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) return null;
  if (!dataUrl) {
    return (
      <div
        className="d-flex align-items-center justify-content-center bg-white rounded border"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <span className="spinner-border spinner-border-sm text-secondary" />
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="Scan this QR code with your authenticator app"
      className="rounded border bg-white p-2"
    />
  );
}
