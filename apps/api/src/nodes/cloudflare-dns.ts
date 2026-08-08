import { config } from "../config.js";

interface CfResult<T> {
  success: boolean;
  errors: Array<{ code?: number; message: string }>;
  result: T;
}

export interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
  data?: Record<string, unknown>;
}

function enabled(): boolean {
  return Boolean(
    config.cloudflare.apiToken && config.cloudflare.zoneId && config.cloudflare.domain,
  );
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = config.cloudflare.apiToken;
  if (!token) throw new Error("Cloudflare is not configured");

  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json()) as CfResult<T>;
  if (!body.success) {
    const msg =
      body.errors
        ?.map((e) => e.message)
        .filter(Boolean)
        .join("; ") || `Cloudflare API error (${res.status})`;
    throw new Error(msg);
  }
  return body.result;
}

/** Turn a server name into a DNS-safe label. */
export function slugifySubdomain(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || "mc";
}

export function fqdnForSlug(slug: string): string {
  return `${slug}.${config.cloudflare.domain}`;
}

async function listRecords(type: string, name: string): Promise<CloudflareDnsRecord[]> {
  const zoneId = config.cloudflare.zoneId;
  const params = new URLSearchParams({
    type,
    name,
    per_page: "50",
  });
  return cfFetch<CloudflareDnsRecord[]>(`/zones/${zoneId}/dns_records?${params.toString()}`);
}

async function deleteRecord(id: string): Promise<void> {
  const zoneId = config.cloudflare.zoneId;
  await cfFetch(`/zones/${zoneId}/dns_records/${id}`, { method: "DELETE" });
}

async function upsertARecord(fqdn: string, ipv4: string): Promise<string> {
  const zoneId = config.cloudflare.zoneId;
  const existing = await listRecords("A", fqdn);
  const payload = {
    type: "A",
    name: fqdn,
    content: ipv4,
    ttl: 1, // automatic
    proxied: false, // Minecraft cannot use Cloudflare proxy
  };
  if (existing[0]) {
    const updated = await cfFetch<CloudflareDnsRecord>(
      `/zones/${zoneId}/dns_records/${existing[0].id}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
    return updated.id;
  }
  const created = await cfFetch<CloudflareDnsRecord>(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return created.id;
}

async function upsertSrvRecord(slug: string, port: number, targetFqdn: string): Promise<string> {
  const zoneId = config.cloudflare.zoneId;
  const name = `_minecraft._tcp.${slug}.${config.cloudflare.domain}`;
  const existing = await listRecords("SRV", name);
  const payload = {
    type: "SRV",
    name,
    ttl: 1,
    data: {
      service: "_minecraft",
      proto: "_tcp",
      name: slug,
      priority: 0,
      weight: 0,
      port,
      target: targetFqdn,
    },
  };
  if (existing[0]) {
    const updated = await cfFetch<CloudflareDnsRecord>(
      `/zones/${zoneId}/dns_records/${existing[0].id}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
    return updated.id;
  }
  const created = await cfFetch<CloudflareDnsRecord>(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return created.id;
}

/**
 * Ensure A + Minecraft SRV records for a server subdomain.
 * Returns the FQDN players can use (SRV resolves the port).
 */
export async function ensureServerSubdomain(opts: {
  preferredSlug: string;
  port: number;
  ipv4: string;
  /** Existing slug to keep if still free / ours */
  currentSlug?: string | null;
}): Promise<{ slug: string; fqdn: string } | null> {
  if (!enabled()) return null;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(opts.ipv4)) {
    throw new Error(`Cloudflare A record needs an IPv4 address, got: ${opts.ipv4}`);
  }

  const slug = slugifySubdomain(opts.currentSlug || opts.preferredSlug);
  const domain = config.cloudflare.domain;

  // Avoid colliding with an unrelated A record; append short suffix if needed
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? slug : `${slug.slice(0, 40)}-${attempt + 1}`;
    const fqdn = `${candidate}.${domain}`;
    const existing = await listRecords("A", fqdn);
    const ours =
      !existing.length ||
      existing.every((r) => r.content === opts.ipv4) ||
      opts.currentSlug === candidate;
    if (!ours) continue;

    await upsertARecord(fqdn, opts.ipv4);
    await upsertSrvRecord(candidate, opts.port, fqdn);
    return { slug: candidate, fqdn };
  }

  throw new Error("Could not allocate a free subdomain on Cloudflare");
}

/** Remove A + SRV records for a subdomain slug. */
export async function deleteServerSubdomain(slug: string | null | undefined): Promise<void> {
  if (!enabled() || !slug) return;
  const domain = config.cloudflare.domain;
  const fqdn = `${slug}.${domain}`;
  const srvName = `_minecraft._tcp.${slug}.${domain}`;

  const aRecords = await listRecords("A", fqdn).catch(() => []);
  for (const r of aRecords) {
    await deleteRecord(r.id).catch(() => undefined);
  }
  const srvRecords = await listRecords("SRV", srvName).catch(() => []);
  for (const r of srvRecords) {
    await deleteRecord(r.id).catch(() => undefined);
  }
}

/**
 * Ensure a DNS-only A record for a node's SFTP endpoint.
 * Uses `{slug}.{domain}` (not proxied — SFTP cannot use CF orange-cloud).
 */
export async function ensureNodeSftpDns(opts: {
  preferredSlug: string;
  ipv4: string;
  currentSlug?: string | null;
}): Promise<{ slug: string; fqdn: string } | null> {
  if (!enabled()) return null;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(opts.ipv4)) {
    throw new Error(`Cloudflare A record needs an IPv4 address, got: ${opts.ipv4}`);
  }

  const slug = slugifySubdomain(opts.currentSlug || opts.preferredSlug);
  const domain = config.cloudflare.domain;

  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? slug : `${slug.slice(0, 40)}-${attempt + 1}`;
    const fqdn = `${candidate}.${domain}`;
    const existing = await listRecords("A", fqdn);
    const ours =
      !existing.length ||
      existing.every((r) => r.content === opts.ipv4) ||
      opts.currentSlug === candidate;
    if (!ours) continue;

    await upsertARecord(fqdn, opts.ipv4);
    return { slug: candidate, fqdn };
  }

  throw new Error("Could not allocate a free SFTP hostname on Cloudflare");
}

/** Remove the A record for a node SFTP slug. */
export async function deleteNodeSftpDns(slug: string | null | undefined): Promise<void> {
  if (!enabled() || !slug) return;
  const fqdn = `${slug}.${config.cloudflare.domain}`;
  const aRecords = await listRecords("A", fqdn).catch(() => []);
  for (const r of aRecords) {
    await deleteRecord(r.id).catch(() => undefined);
  }
}

export function cloudflareConfigured(): boolean {
  return enabled();
}
