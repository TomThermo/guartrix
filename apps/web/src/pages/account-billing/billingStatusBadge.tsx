import { Badge } from "react-bootstrap";

export function billingStatusBadge(status: string) {
  const bg =
    status === "PAID" || status === "active"
      ? "success"
      : status === "OPEN" || status === "PENDING" || status === "pending"
        ? "warning"
        : status === "CANCELED" ||
            status === "EXPIRED" ||
            status === "FAILED" ||
            status === "canceled" ||
            status === "suspended"
          ? "secondary"
          : "secondary";
  return <Badge bg={bg}>{status}</Badge>;
}
