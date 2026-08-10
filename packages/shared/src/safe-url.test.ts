import { describe, expect, it } from "vitest";
import {
  hostLooksLocal,
  isBlockedIp,
  normalizeHostname,
  parseSafeHttpUrl,
  safeExternalUrl,
  safeHttpUrl,
} from "./safe-url.js";

describe("normalizeHostname", () => {
  it("trims, lowercases, and strips a trailing dot", () => {
    expect(normalizeHostname("  Example.COM. ")).toBe("example.com");
    expect(normalizeHostname("Foo.")).toBe("foo");
  });
});

describe("isBlockedIp", () => {
  it("blocks empty / invalid input", () => {
    expect(isBlockedIp("")).toBe(true);
    expect(isBlockedIp("   ")).toBe(true);
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });

  it("blocks private and special IPv4 ranges", () => {
    expect(isBlockedIp("0.0.0.0")).toBe(true);
    expect(isBlockedIp("10.0.0.1")).toBe(true);
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("169.254.169.254")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("100.64.0.1")).toBe(true);
    expect(isBlockedIp("100.127.0.1")).toBe(true);
    expect(isBlockedIp("224.0.0.1")).toBe(true);
    expect(isBlockedIp("255.255.255.255")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isBlockedIp("1.1.1.1")).toBe(false);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("93.184.216.34")).toBe(false);
    expect(isBlockedIp("172.15.0.1")).toBe(false);
    expect(isBlockedIp("172.32.0.1")).toBe(false);
    expect(isBlockedIp("100.63.0.1")).toBe(false);
    expect(isBlockedIp("100.128.0.1")).toBe(false);
  });

  it("blocks loopback, ULA, and link-local IPv6", () => {
    expect(isBlockedIp("::")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
    expect(isBlockedIp("fd12:3456:789a::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
  });

  it("blocks IPv4-mapped private addresses", () => {
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:192.168.0.1")).toBe(true);
  });

  it("allows public IPv6 and mapped public IPv4", () => {
    expect(isBlockedIp("2001:4860:4860::8888")).toBe(false);
    expect(isBlockedIp("::ffff:1.1.1.1")).toBe(false);
  });
});

describe("hostLooksLocal", () => {
  it("blocks localhost / metadata / special TLDs and private literals", () => {
    expect(hostLooksLocal("localhost")).toBe(true);
    expect(hostLooksLocal("Foo.Localhost")).toBe(true);
    expect(hostLooksLocal("svc.local")).toBe(true);
    expect(hostLooksLocal("x.internal")).toBe(true);
    expect(hostLooksLocal("metadata.google.internal")).toBe(true);
    expect(hostLooksLocal("127.0.0.1")).toBe(true);
    expect(hostLooksLocal("10.0.0.1")).toBe(true);
    expect(hostLooksLocal("100.64.1.1")).toBe(true);
    expect(hostLooksLocal("::1")).toBe(true);
  });

  it("allows public hostnames and public IPs", () => {
    expect(hostLooksLocal("example.com")).toBe(false);
    expect(hostLooksLocal("1.1.1.1")).toBe(false);
    expect(hostLooksLocal("cdn.modrinth.com")).toBe(false);
  });
});

describe("parseSafeHttpUrl / safeHttpUrl / safeExternalUrl", () => {
  it("allows public http(s) and rejects locals / credentials / non-http", () => {
    expect(parseSafeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHttpUrl("http://1.1.1.1/")).toBe("http://1.1.1.1/");
    expect(safeExternalUrl("https://cdn.example/x")).toBe("https://cdn.example/x");
    expect(parseSafeHttpUrl(undefined)).toBeNull();
    expect(parseSafeHttpUrl("")).toBeNull();
    expect(parseSafeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseSafeHttpUrl("https://localhost/")).toBeNull();
    expect(parseSafeHttpUrl("https://192.168.0.1/")).toBeNull();
    expect(parseSafeHttpUrl("https://user:pass@example.com/")).toBeNull();
    expect(parseSafeHttpUrl("not a url")).toBeNull();
  });
});
