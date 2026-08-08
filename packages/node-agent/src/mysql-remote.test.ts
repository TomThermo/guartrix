import { describe, expect, it } from "vitest";
import { assertSafeMysqlRemote } from "./mysql-crud.js";

describe("assertSafeMysqlRemote", () => {
  it("defaults to 172.% and accepts private patterns", () => {
    expect(assertSafeMysqlRemote(undefined)).toBe("172.%");
    expect(assertSafeMysqlRemote("10.%")).toBe("10.%");
    expect(assertSafeMysqlRemote("192.168.%")).toBe("192.168.%");
    expect(assertSafeMysqlRemote("localhost")).toBe("localhost");
    expect(assertSafeMysqlRemote("127.0.0.1")).toBe("127.0.0.1");
    expect(assertSafeMysqlRemote("172.18.%")).toBe("172.18.%");
  });

  it("rejects world grant % on create/rotate", () => {
    expect(() => assertSafeMysqlRemote("%")).toThrow(/not allowed/i);
  });

  it("allows % only when allowWorld is set (legacy delete)", () => {
    expect(assertSafeMysqlRemote("%", { allowWorld: true })).toBe("%");
  });

  it("rejects public-looking hosts", () => {
    expect(() => assertSafeMysqlRemote("8.8.8.8")).toThrow(/private/i);
    expect(() => assertSafeMysqlRemote("example.com")).toThrow(/Invalid|private/i);
  });
});
