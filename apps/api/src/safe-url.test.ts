import { describe, expect, it } from "vitest";
import {
  assertSafeBrowserUrl,
  assertSafeOutboundUrl,
  fetchPinned,
  isBlockedIp,
  resolveSafeOutboundUrl,
} from "./safe-url.js";
import http from "node:http";
import type { AddressInfo } from "node:net";

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

describe("assertSafeOutboundUrl", () => {
  it("rejects empty, invalid, and non-https URLs", async () => {
    await expect(assertSafeOutboundUrl("")).rejects.toThrow(/required/i);
    await expect(assertSafeOutboundUrl("not a url")).rejects.toThrow(/invalid/i);
    await expect(
      assertSafeOutboundUrl("http://example.com", { resolveDns: false }),
    ).rejects.toThrow(/HTTPS/i);
    await expect(
      assertSafeOutboundUrl("ftp://example.com", {
        httpsOnly: false,
        resolveDns: false,
      }),
    ).rejects.toThrow(/HTTP\(S\)/i);
  });

  it("rejects credentials and local hosts", async () => {
    await expect(
      assertSafeOutboundUrl("https://user:pass@example.com/hook", {
        resolveDns: false,
      }),
    ).rejects.toThrow(/credentials/i);
    await expect(
      assertSafeOutboundUrl("https://localhost/hook", { resolveDns: false }),
    ).rejects.toThrow(/not allowed/i);
    await expect(
      assertSafeOutboundUrl("https://metadata.google.internal/", {
        resolveDns: false,
      }),
    ).rejects.toThrow(/not allowed/i);
    await expect(
      assertSafeOutboundUrl("https://127.0.0.1/", { resolveDns: false }),
    ).rejects.toThrow(/not allowed/i);
    await expect(
      assertSafeOutboundUrl("https://192.168.1.10/x", { resolveDns: false }),
    ).rejects.toThrow(/not allowed/i);
    await expect(
      assertSafeOutboundUrl("https://foo.localhost/x", { resolveDns: false }),
    ).rejects.toThrow(/not allowed/i);
  });

  it("enforces allowlisted host suffixes", async () => {
    await expect(
      assertSafeOutboundUrl("https://evil.example/path", {
        resolveDns: false,
        allowedHostSuffixes: ["discord.com"],
      }),
    ).rejects.toThrow(/allowlist/i);
    await expect(
      assertSafeOutboundUrl("https://cdn.discord.com/api/webhooks/1/a", {
        resolveDns: false,
        allowedHostSuffixes: ["discord.com"],
      }),
    ).resolves.toMatch(/^https:\/\/cdn\.discord\.com\//);
  });

  it("returns normalized href for a public IP host without DNS", async () => {
    const href = await assertSafeOutboundUrl("https://1.1.1.1/path", {
      resolveDns: false,
    });
    expect(href).toBe("https://1.1.1.1/path");
  });

  it("allows http when httpsOnly is false", async () => {
    const href = await assertSafeOutboundUrl("http://1.1.1.1/x", {
      httpsOnly: false,
      resolveDns: false,
    });
    expect(href).toBe("http://1.1.1.1/x");
  });
});

describe("resolveSafeOutboundUrl (DNS pin addresses)", () => {
  it("returns pinned addresses for literal public IPs", async () => {
    const resolved = await resolveSafeOutboundUrl("https://1.1.1.1/path", {
      resolveDns: true,
    });
    expect(resolved.href).toBe("https://1.1.1.1/path");
    expect(resolved.addresses).toEqual([{ address: "1.1.1.1", family: 4 }]);
  });

  it("rejects private literal IPs even with resolveDns", async () => {
    await expect(
      resolveSafeOutboundUrl("https://127.0.0.1/", { resolveDns: true }),
    ).rejects.toThrow(/not allowed/i);
    await expect(
      resolveSafeOutboundUrl("https://10.0.0.1/", { resolveDns: true }),
    ).rejects.toThrow(/not allowed/i);
  });
});

describe("fetchPinned", () => {
  it("connects to the pinned address (not the URL hostname DNS)", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("pinned-ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    try {
      const res = await fetchPinned(
        {
          href: `http://cdn.example.test:${port}/file`,
          hostname: "cdn.example.test",
          addresses: [{ address: "127.0.0.1", family: 4 }],
        },
        { method: "GET" },
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("pinned-ok");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it("rejects when no addresses were validated", async () => {
    await expect(
      fetchPinned({
        href: "https://example.com/",
        hostname: "example.com",
        addresses: [],
      }),
    ).rejects.toThrow(/no validated addresses/i);
  });
});

describe("assertSafeBrowserUrl", () => {
  it("allows http(s) public hosts and rejects locals", () => {
    expect(assertSafeBrowserUrl("https://example.com/page")).toBe(
      "https://example.com/page",
    );
    expect(assertSafeBrowserUrl("http://1.1.1.1/")).toBe("http://1.1.1.1/");
    expect(() => assertSafeBrowserUrl("javascript:alert(1)")).toThrow(
      /HTTP\(S\)/i,
    );
    expect(() => assertSafeBrowserUrl("https://localhost/")).toThrow(
      /not allowed/i,
    );
  });
});
