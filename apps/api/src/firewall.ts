import {
  daemonFirewallClose,
  daemonFirewallOpen,
} from "./daemon-client.js";

/** Game-node firewall (via that node's daemon). */
export async function openFirewallPort(
  port: number,
  nodeId?: string | null,
  protocol: "tcp" | "udp" = "tcp",
): Promise<void> {
  await daemonFirewallOpen(port, nodeId, protocol);
}

export async function closeFirewallPort(
  port: number,
  nodeId?: string | null,
  protocol: "tcp" | "udp" = "tcp",
): Promise<void> {
  await daemonFirewallClose(port, nodeId, protocol);
}

export async function changeFirewallPort(
  oldPort: number,
  newPort: number,
  nodeId?: string | null,
  protocol: "tcp" | "udp" = "tcp",
): Promise<void> {
  if (oldPort === newPort) return;
  await closeFirewallPort(oldPort, nodeId, protocol).catch(() => undefined);
  await openFirewallPort(newPort, nodeId, protocol);
}

export function firewallEnabled(): boolean {
  return (
    process.env.MANAGE_FIREWALL === "true" ||
    process.env.MANAGE_FIREWALL === "1"
  );
}
