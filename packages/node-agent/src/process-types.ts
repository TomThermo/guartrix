import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { ServerType } from "@guartrix/shared";

export interface DaemonPortPublish {
  port: number;
  protocol: "tcp" | "udp";
}

export interface DaemonServerConfig {
  id: string;
  type: ServerType;
  mcVersion: string;
  port: number;
  memoryMb: number;
  autoRestart: boolean;
  /** Major Java version ("8"|"11"|"17"|"21"|"25"). */
  javaVersion?: string | null;
  /** Startup template; null = default. */
  startupCommand?: string | null;
  /** Jar filename; null = server.jar. */
  serverJar?: string | null;
  /** Disk quota MB (0 = unlimited). */
  diskMb?: number;
  /** CPU percent of one core (100 = 1.0); 0 = unlimited. */
  cpuLimit?: number;
  /** All host ports to publish (primary + extras). Defaults to primary TCP. */
  ports?: DaemonPortPublish[];
  /** Purple console notices emitted before container rebuild (port/firewall sync). */
  startupNotices?: string[];
  /** Extra host→container binds (shared plugins/worlds). */
  extraMounts?: Array<{
    host: string;
    container: string;
    readOnly?: boolean;
  }> | null;
}

/** A Minecraft server whose console is attached to a live docker process. */
export interface ManagedProcess {
  process: ChildProcessWithoutNullStreams;
  container: string;
  onlinePlayers: Set<string>;
}
