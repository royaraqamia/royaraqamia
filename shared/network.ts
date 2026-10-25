/**
 * The one definition of "a public network target". The Media Downloader's link
 * guard and the news feed probe's SSRF guard both import from here so their
 * postures cannot drift apart.
 *
 * Deliberately pure string logic: client components import this module, so it
 * must not reach for `node:net` or `node:dns`. Addresses that a caller resolved
 * itself are classified with `isPublicIpAddress`.
 */

/** The broad scheme guard every outbound link must pass. */
export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize a host for comparison. DNS's absolute form of a name (`example.com.`)
 * resolves identically to the relative form but compares differently, so every
 * host check strips a single trailing dot and lowercases first. Shared so the
 * Blocklist, the Platform allowlist and the SSRF guards cannot drift apart.
 */
export function normalizeHostname(host: string): string {
  return host.toLowerCase().replace(/\.$/, '');
}

type Ipv4 = readonly [number, number, number, number];

function parseIpv4(value: string): Ipv4 | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }

  return [octets[0] ?? 0, octets[1] ?? 0, octets[2] ?? 0, octets[3] ?? 0];
}

/**
 * A public IPv4 address: not unspecified, loopback, private, link-local,
 * carrier-grade NAT, multicast or reserved. The special-purpose ranges are
 * refused too, because none of them is a host a feed or a media provider lives
 * on.
 */
function isPublicIpv4([a = 0, b = 0, c = 0]: Ipv4): boolean {
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a >= 224) return false;
  return true;
}

function parseIpv6(value: string): readonly number[] | null {
  let text = value.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  if (!text.includes(':')) return null;

  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const high = ((v4[0] << 8) | v4[1]).toString(16);
    const low = ((v4[2] << 8) | v4[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const parseHalf = (half: string): number[] | null => {
    if (half === '') return [];
    const out: number[] = [];
    for (const group of half.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(Number.parseInt(group, 16));
    }
    return out;
  };

  let groups: number[];
  if (halves.length === 2) {
    const head = parseHalf(halves[0] ?? '');
    const tailGroups = parseHalf(halves[1] ?? '');
    if (!head || !tailGroups) return null;
    const zeros = 8 - head.length - tailGroups.length;
    if (zeros < 0) return null;
    groups = [...head, ...new Array<number>(zeros).fill(0), ...tailGroups];
  } else {
    const head = parseHalf(halves[0] ?? '');
    if (!head) return null;
    groups = head;
  }

  return groups.length === 8 ? groups : null;
}

function isPrivateIpv6(groups: readonly number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return !isPublicIpv4([(g6 >> 8) & 0xff, g6 & 0xff, (g7 >> 8) & 0xff, g7 & 0xff]);
  }

  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return !isPublicIpv4([(g6 >> 8) & 0xff, g6 & 0xff, (g7 >> 8) & 0xff, g7 & 0xff]);
  }

  if ((g0 & 0xfe00) === 0xfc00) return true;
  if ((g0 & 0xffc0) === 0xfe80) return true;
  if ((g0 & 0xffc0) === 0xfec0) return true;
  if ((g0 & 0xff00) === 0xff00) return true;
  if (g0 === 0x2001 && g1 === 0x0db8) return true;

  if (g0 === 0x2002) {
    return !isPublicIpv4([(g1 >> 8) & 0xff, g1 & 0xff, (g2 >> 8) & 0xff, g2 & 0xff]);
  }

  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return !isPublicIpv4([(g6 >> 8) & 0xff, g6 & 0xff, (g7 >> 8) & 0xff, g7 & 0xff]);
  }

  return false;
}

/**
 * Whether an address that a caller already resolved is public. An unparseable
 * value is treated as non-public: a guard should fail closed.
 */
export function isPublicIpAddress(value: string): boolean {
  const host = normalizeHostname(value.replace(/^\[|\]$/g, ''));
  const ipv4 = parseIpv4(host);
  if (ipv4) return isPublicIpv4(ipv4);

  const ipv6 = parseIpv6(host);
  if (ipv6) return !isPrivateIpv6(ipv6);

  return false;
}

/**
 * SSRF guard: an http(s) URL whose host is a public name or address. Rejects
 * loopback and the private/link-local IPv4 ranges, and refuses every IPv6
 * literal (including IPv4-mapped forms like `::ffff:127.0.0.1`) rather than
 * trying to classify them here. Hostnames that *resolve* to a private address
 * are the caller's concern: a client-side check cannot see them, and a
 * server-side one classifies each resolved address with `isPublicIpAddress`.
 */
export function isPublicHttpUrl(value: string): boolean {
  if (!isHttpUrl(value)) return false;

  let host: string;
  try {
    host = normalizeHostname(new URL(value).hostname.replace(/^\[|\]$/g, ''));
  } catch {
    return false;
  }

  if (host.length === 0) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.includes(':')) return false;

  const ipv4 = parseIpv4(host);
  if (ipv4) return isPublicIpv4(ipv4);

  return true;
}
