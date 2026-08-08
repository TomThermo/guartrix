import { spawn } from "node:child_process";

/** Bind server and log startup info. */
export function listenWithError(server, config, port, label, onListen) {
  const {
    WEB_HOST,
    API_HOST,
    API_PORT,
    LICENSE_PUBLIC_HOST,
    LICENSE_PROXY_HOST,
    LICENSE_PROXY_PORT,
    DAEMON_PUBLIC_HOST,
    DAEMON_PROXY_HOST,
    DAEMON_PROXY_PORT,
    DOWNLOAD_PUBLIC_HOST,
  } = config;

  server.on("error", (err) => {
    if (err && err.code === "EACCES") {
      console.error(`[guartrix] Cannot bind ${label} port ${port} (permission denied). Use sudo.`);
    } else if (err && err.code === "EADDRINUSE") {
      console.error(`[guartrix] ${label} port ${port} is already in use.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
  server.listen(port, WEB_HOST, () => {
    console.log(
      `[guartrix] Web UI ${label} on ${WEB_HOST}:${port} (API proxy → ${API_HOST}:${API_PORT})`,
    );
    if (LICENSE_PUBLIC_HOST) {
      console.log(
        `[guartrix] License host ${LICENSE_PUBLIC_HOST} → ${LICENSE_PROXY_HOST}:${LICENSE_PROXY_PORT}`,
      );
    }
    if (DAEMON_PUBLIC_HOST) {
      console.log(
        `[guartrix] Daemon host ${DAEMON_PUBLIC_HOST} → ${DAEMON_PROXY_HOST}:${DAEMON_PROXY_PORT}`,
      );
    }
    if (DOWNLOAD_PUBLIC_HOST) {
      console.log(`[guartrix] Download host ${DOWNLOAD_PUBLIC_HOST} → /download (DNS-only)`);
    }
    onListen?.();
  });
}

/** Optionally open ufw when MANAGE_FIREWALL is set. */
export function openFirewall(port) {
  if (process.env.MANAGE_FIREWALL !== "true" && process.env.MANAGE_FIREWALL !== "1") {
    return;
  }
  const child = spawn("sudo", ["-n", "ufw", "allow", `${port}/tcp`], {
    stdio: "ignore",
  });
  child.on("error", () => undefined);
}
