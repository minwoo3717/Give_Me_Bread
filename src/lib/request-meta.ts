/**
 * Client IP for rate limiting.
 *
 * Behind CloudFront the trustworthy source is `CloudFront-Viewer-Address`
 * ("ip:port"), which CloudFront sets itself; the /admin* cache behavior
 * forwards it to the origin. X-Forwarded-For is only a fallback for local
 * runs: its first entry is client-controlled.
 */
export function clientIpFrom(headers: Headers): string {
  const viewer = headers.get("cloudfront-viewer-address");
  if (viewer) {
    const ip = stripPort(viewer.trim());
    if (ip) return ip;
  }
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

function stripPort(value: string): string {
  // "[2001:db8::1]:443" (bracketed IPv6)
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 ? value.slice(1, end) : value;
  }
  const lastColon = value.lastIndexOf(":");
  if (lastColon === -1) return value;
  // "198.51.100.10:46532" -> one colon -> IPv4 with port.
  // CloudFront writes IPv6 as "2001:db8::1:46532": the last group is the port.
  return value.slice(0, lastColon);
}

/**
 * Rate-limit key for an address: IPv4 as-is, IPv6 reduced to its /64.
 * One subscriber usually controls a whole /64, so keying on the full IPv6
 * address would hand an attacker billions of fresh keys.
 */
export function rateLimitKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const groups = expandIpv6(ip);
  return groups ? `${groups.slice(0, 4).join(":")}::/64` : ip;
}

function expandIpv6(ip: string): string[] | null {
  const address = ip.split("%")[0].toLowerCase();
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  // An embedded IPv4 tail (::ffff:1.2.3.4) is fine to leave unexpanded here:
  // only the first four groups matter.
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  return groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? g.replace(/^0+(?=.)/, "") : g));
}
