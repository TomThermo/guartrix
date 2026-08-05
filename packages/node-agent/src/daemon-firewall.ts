import dns from "node:dns/promises";
import { firewallEnabled, openFirewallPort } from "./firewall.js";

/** Restrict daemon API port to the panel host IP via ufw (when MANAGE_FIREWALL + PANEL_URL). */
export async function ensureDaemonPortPanelOnly(port: number): Promise<void> {
  if (!firewallEnabled) return;
  const panelUrl = process.env.PANEL_URL?.trim();
  if (!panelUrl) return;
  try {
    const host = new URL(panelUrl).hostname;
    if (!host) return;
    const ips = await dns.resolve4(host);
    const ip = ips[0];
    if (!ip) return;
    await openFirewallPort(port, "tcp", { from: ip });
    console.info(
      `[guartrix] Firewall: daemon ${port}/tcp restricted to panel ${ip}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[guartrix] Could not restrict daemon port to panel IP: ${message}`,
    );
  }
}
