import { deleteNodeSftpDns, ensureNodeSftpDns, slugifySubdomain } from "./cloudflare-dns.js";
import { prisma } from "../db.js";
import { resolveNodePublicIpv4 } from "./nodes-serialize.js";

const DEFAULT_SFTP_PORT = 2022;

/**
 * Ensure Cloudflare A record for this node's SFTP hostname and persist fields.
 */
export async function syncNodeSftpDns(nodeId: string, reportedIp?: string | null): Promise<void> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node) return;

  const ipv4 = resolveNodePublicIpv4(node, reportedIp);
  if (!ipv4) {
    console.warn(`[guartrix] Skipping SFTP DNS for node ${node.name}: no public IPv4`);
    return;
  }

  try {
    const dns = await ensureNodeSftpDns({
      preferredSlug: slugifySubdomain(node.name),
      ipv4,
      currentSlug: node.sftpDnsSlug,
    });
    if (!dns) return;

    const sftpPort = node.sftpPort || DEFAULT_SFTP_PORT;

    if (
      node.sftpHostname !== dns.fqdn ||
      node.sftpDnsSlug !== dns.slug ||
      node.sftpPort !== sftpPort
    ) {
      await prisma.node.update({
        where: { id: node.id },
        data: {
          sftpHostname: dns.fqdn,
          sftpDnsSlug: dns.slug,
          sftpPort,
        },
      });
      console.info(`[guartrix] SFTP hostname for node "${node.name}": ${dns.fqdn}:${sftpPort}`);
    }
  } catch (err) {
    console.warn(
      `[guartrix] SFTP DNS sync failed for node ${node.name}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function removeNodeSftpDns(nodeId: string): Promise<void> {
  const node = await prisma.node.findUnique({ where: { id: nodeId } });
  if (!node?.sftpDnsSlug) return;
  await deleteNodeSftpDns(node.sftpDnsSlug).catch(() => undefined);
}
