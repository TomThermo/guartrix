export function nodePublicUrl(node: { scheme: string; fqdn: string; daemonPort: number }): string {
  const defaultPort = node.scheme === "https" ? 443 : node.scheme === "http" ? 80 : null;
  if (defaultPort !== null && node.daemonPort === defaultPort) {
    return `${node.scheme}://${node.fqdn}`;
  }
  return `${node.scheme}://${node.fqdn}:${node.daemonPort}`;
}

/** Parse Node.tags JSON into a string[]. */
export function parseNodeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parseNodeTags(parsed);
    } catch {
      return raw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/** Budget after overallocate % (0 limit = unlimited → 0). */
export function nodeAllocationBudget(limit: number, overallocatePercent: number): number {
  if (limit <= 0) return 0;
  const over = Math.max(0, Math.min(1000, Math.floor(overallocatePercent || 0)));
  return Math.floor((limit * (100 + over)) / 100);
}

/** Host string shown to SFTP clients. */
export function nodeSftpDisplayHost(node: {
  sftpAlias?: string | null;
  sftpHostname?: string | null;
  fqdn: string;
}): string {
  const alias = node.sftpAlias?.trim();
  if (alias) return alias;
  const host = node.sftpHostname?.trim();
  if (host) return host;
  return node.fqdn;
}

/** @deprecated Prefer nodeAllocationBudget — kept for callers expecting reserve MiB. */
export function nodeMemoryReserveMb(capacityMb: number): number {
  if (capacityMb <= 0) return 0;
  return Math.max(1536, Math.floor(capacityMb * 0.15));
}
