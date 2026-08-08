/** Open the server console in a dedicated browser window (reuses same window name per server). */
export function openConsolePopout(serverId: string): void {
  const url = `/servers/${encodeURIComponent(serverId)}/console`;
  const features = [
    "popup=yes",
    "width=960",
    "height=720",
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
  ].join(",");
  const win = window.open(url, `guartrix-console-${serverId}`, features);
  win?.focus();
}
