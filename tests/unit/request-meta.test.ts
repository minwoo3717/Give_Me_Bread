import { describe, expect, it } from "vitest";
import { clientIpFrom, rateLimitKey } from "@/lib/request-meta";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIpFrom", () => {
  it("prefers CloudFront-Viewer-Address and strips the port (IPv4)", () => {
    expect(
      clientIpFrom(h({ "cloudfront-viewer-address": "198.51.100.10:46532", "x-forwarded-for": "6.6.6.6" })),
    ).toBe("198.51.100.10");
  });

  it("handles IPv6 viewer addresses", () => {
    expect(clientIpFrom(h({ "cloudfront-viewer-address": "2001:db8::1:46532" }))).toBe("2001:db8::1");
    expect(clientIpFrom(h({ "cloudfront-viewer-address": "[2001:db8::1]:443" }))).toBe("2001:db8::1");
  });

  it("falls back to the first X-Forwarded-For entry for local runs", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
  });

  it("never returns an empty key", () => {
    expect(clientIpFrom(h({}))).toBe("unknown");
  });
});

describe("rateLimitKey", () => {
  it("keeps IPv4 addresses as they are", () => {
    expect(rateLimitKey("198.51.100.10")).toBe("198.51.100.10");
  });

  it("groups an IPv6 /64 into one key, however the address is written", () => {
    const a = rateLimitKey("2001:db8:abcd:12::1");
    const b = rateLimitKey("2001:0db8:abcd:0012:ffff:eeee:dddd:cccc");
    expect(a).toBe("2001:db8:abcd:12::/64");
    expect(b).toBe(a);
    expect(rateLimitKey("2001:db8:abcd:13::1")).not.toBe(a);
  });

  it("handles leading :: and compressed forms", () => {
    expect(rateLimitKey("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });
});
