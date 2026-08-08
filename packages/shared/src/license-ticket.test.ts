import { describe, expect, it } from "vitest";
import {
  UNLICENSED_MAX_DISK_MB,
  UNLICENSED_MAX_MEMORY_MB,
  UNLICENSED_MAX_SERVERS,
  freeTierCaps,
} from "./license-ticket.js";

describe("freeTierCaps", () => {
  it("returns free-tier ceilings", () => {
    expect(freeTierCaps()).toEqual({
      maxServers: UNLICENSED_MAX_SERVERS,
      maxDiskMb: UNLICENSED_MAX_DISK_MB,
      maxMemoryMb: UNLICENSED_MAX_MEMORY_MB,
      maxMemoryMbPerServer: null,
    });
  });
});
