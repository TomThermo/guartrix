import { describe, expect, it } from "vitest";
import { isDaemonEventServerMessage, parseDaemonEventMessage } from "./daemon-events.js";

describe("parseDaemonEventMessage", () => {
  it("parses hello and error envelopes", () => {
    expect(parseDaemonEventMessage({ type: "hello", daemonVersion: "1.4.22" })).toEqual({
      type: "hello",
      daemonVersion: "1.4.22",
    });
    expect(parseDaemonEventMessage({ type: "error", message: "nope" })).toEqual({
      type: "error",
      message: "nope",
    });
  });

  it("parses multiplexed server events", () => {
    const stats = {
      running: true,
      cpuPercent: 1,
      memoryUsedBytes: 1,
      memoryLimitBytes: 2,
      memoryPercent: 50,
      networkRxBytes: 0,
      networkTxBytes: 0,
      blockReadBytes: 0,
      blockWriteBytes: 0,
      pids: 1,
      memoryUsedLabel: "1 B",
      memoryLimitLabel: "2 B",
      networkRxLabel: "0 B",
      networkTxLabel: "0 B",
      blockReadLabel: "0 B",
      blockWriteLabel: "0 B",
    };
    const status = parseDaemonEventMessage({
      type: "status",
      serverId: "s1",
      status: "RUNNING",
      errorMessage: null,
    });
    expect(status).toEqual({
      type: "status",
      serverId: "s1",
      status: "RUNNING",
      errorMessage: null,
    });
    expect(isDaemonEventServerMessage(status!)).toBe(true);

    const players = parseDaemonEventMessage({
      type: "players",
      serverId: "s1",
      players: ["Steve"],
    });
    expect(players).toEqual({ type: "players", serverId: "s1", players: ["Steve"] });

    const output = parseDaemonEventMessage({
      type: "output",
      serverId: "s1",
      line: "Done",
      stream: "stderr",
    });
    expect(output).toEqual({
      type: "output",
      serverId: "s1",
      line: "Done",
      stream: "stderr",
    });

    const statsMsg = parseDaemonEventMessage({ type: "stats", serverId: "s1", stats });
    expect(statsMsg).toEqual({ type: "stats", serverId: "s1", stats });
  });

  it("rejects malformed payloads", () => {
    expect(parseDaemonEventMessage(null)).toBeNull();
    expect(parseDaemonEventMessage({ type: "stats", serverId: "s1" })).toBeNull();
    expect(parseDaemonEventMessage({ type: "players", serverId: "s1", players: [1] })).toBeNull();
  });
});
