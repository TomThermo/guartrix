import { afterEach, describe, expect, it } from "vitest";
import {
  isBackupBusy,
  releaseBackupBusy,
  resetBackupBusyLocalForTests,
  tryAcquireBackupBusy,
} from "./backup-busy.js";

describe("backup-busy (local, no Redis)", () => {
  afterEach(() => {
    resetBackupBusyLocalForTests();
  });

  it("acquires, reports busy, and releases", async () => {
    expect(await isBackupBusy("srv_a")).toBe(false);
    expect(await tryAcquireBackupBusy("srv_a")).toBe(true);
    expect(await isBackupBusy("srv_a")).toBe(true);
    expect(await tryAcquireBackupBusy("srv_a")).toBe(false);
    expect(await tryAcquireBackupBusy("srv_b")).toBe(true);
    await releaseBackupBusy("srv_a");
    expect(await isBackupBusy("srv_a")).toBe(false);
    expect(await tryAcquireBackupBusy("srv_a")).toBe(true);
  });
});
