import { lookup as nodeLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * The one place a request to a third-party MCP server is allowed to leave this
 * process (ADR-0155, `docs/specs/mcp-marketplace.md`).
 *
 * The marketplace calls URLs nobody here wrote: the catalogue comes from a
 * public registry, and a member taps a row. That is an SSRF surface in front of
 * our own network, so the policy is not a helper the client may skip — the
 * client is *given* its `fetch` from this module and has no other way out.
 *
 * The rules, in the order they are applied:
 *
 * - `https` on 443 only, with no userinfo and no fragment.
 * - No IP literals, and no single-label host, so `https://10.0.0.1` and
 *   `https://metadata` never reach the resolver.
 * - Every address the hostname resolves to must be public. All of them, not the
 *   first: a host that answers one public and one private address is a host
 *   that is trying something.
 * - Redirects are followed at most once, and the new URL goes through the whole
 *   check again. `authorization` does not travel across an origin change.
 * - No cookies ever, a 20s ceiling, and a 1 MB content-length refusal.
 *
 * Two limits are worth stating rather than hiding: DNS is resolved before the
 * request and fetch resolves again, which is a rebinding window; and the size
 * refusal reads `content-length`, so a chunked response is bounded by the
 * reader (`readCappedText`) rather than by this module.
 */

export class EgressBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EgressBlockedError';
  }
}

export const EGRESS_TIMEOUT_MS = 20_000;
export const EGRESS_MAX_RESPONSE_BYTES = 1_048_576;
export const EGRESS_ALLOWED_PORT = '443';

/** Every range a request from Vercel must never reach. */
const BLOCKED = new BlockList();

// IPv4: "this network", private, CGNAT, loopback, link-local, the three
// documentation ranges, benchmarking, multicast and reserved.
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}

// IPv6: unspecified, loopback, unique-local, link-local, multicast, the
// documentation prefix, and NAT64 — which embeds an IPv4 address a resolver
// could have given us in the first place.
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['64:ff9b::', 96],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

/** Suffixes that name a network this deployment sits inside. */
const BLOCKED_HOST_SUFFIXES = ['.internal', '.local', '.localhost', '.home.arpa'];

/** True for an address a request from this process must not reach. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family !== 6) return true;

  // An IPv4-mapped IPv6 address reaches the same IPv4 host, so it is checked as
  // the address it actually names.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped?.[1]) return BLOCKED.check(mapped[1], 'ipv4');

  return BLOCKED.check(address, 'ipv6');
}

/**
 * The shape rules. Returns the parsed URL so a caller cannot check one URL and
 * fetch another.
 */
export function assertEgressUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    throw new EgressBlockedError('عنوان الخادم غير صالح');
  }

  if (url.protocol !== 'https:') throw new EgressBlockedError('يجب أن يكون عنوان الخادم https');
  if (url.port !== '' && url.port !== EGRESS_ALLOWED_PORT) {
    throw new EgressBlockedError('المنفذ المسموح هو 443 فقط');
  }
  if (url.username !== '' || url.password !== '') {
    throw new EgressBlockedError('لا يُسمح بعنوان يحمل بيانات دخول');
  }

  const host = url.hostname.toLowerCase();
  if (host.startsWith('[') || isIP(host) !== 0) {
    throw new EgressBlockedError('لا يُسمح بعنوان IP مباشر');
  }
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new EgressBlockedError('عنوان داخلي غير مسموح');
  }
  if (!host.includes('.')) throw new EgressBlockedError('اسم النطاق غير صالح');

  return url;
}

type ResolveHost = (hostname: string) => Promise<Array<{ address: string }>>;

const defaultResolveHost: ResolveHost = (hostname) => nodeLookup(hostname, { all: true });

/** The resolver rule: refuse when *any* answer is private, or when there is none. */
export async function assertPublicHost(
  url: URL,
  resolveHost: ResolveHost = defaultResolveHost
): Promise<void> {
  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolveHost(url.hostname);
  } catch {
    throw new EgressBlockedError('تعذّر تحويل اسم الخادم إلى عنوان');
  }

  if (addresses.length === 0) throw new EgressBlockedError('تعذّر تحويل اسم الخادم إلى عنوان');
  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw new EgressBlockedError('عنوان الخادم يشير إلى شبكة داخلية');
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isRedirect(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

function withTimeout(signal: AbortSignal | null | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout;
}

export interface GuardedFetchOptions {
  /** The real network call; replaced in tests. */
  fetchImpl?: typeof fetch;
  /** DNS, replaced in tests. */
  resolveHost?: ResolveHost;
  timeoutMs?: number;
  maxBytes?: number;
  /** At most one hop: a second redirect is the server's problem, not ours. */
  maxRedirects?: number;
}

/**
 * The guarded `fetch`. Everything the MCP client sends — discovery, DCR, the
 * token exchange, `initialize`, `tools/list` — goes through this function.
 */
export function createGuardedFetch(options: GuardedFetchOptions = {}): typeof fetch {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const timeoutMs = options.timeoutMs ?? EGRESS_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? EGRESS_MAX_RESPONSE_BYTES;
  const maxRedirects = options.maxRedirects ?? 1;

  async function validate(input: string | URL): Promise<URL> {
    const url = assertEgressUrl(input);
    await assertPublicHost(url, resolveHost);
    return url;
  }

  const guarded = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    let url = await validate(input);
    let headers = new Headers(init?.headers);
    // A cookie jar must never carry one member's session to a stranger.
    headers.delete('cookie');

    for (let hop = 0; ; hop += 1) {
      const response = await fetchImpl(url, {
        ...init,
        headers,
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        signal: withTimeout(init?.signal, timeoutMs),
      });

      const location = response.headers.get('location');
      if (isRedirect(response.status) && location) {
        if (hop >= maxRedirects) throw new EgressBlockedError('إعادة توجيه غير مسموحة');
        const next = new URL(location, url);
        const validated = await validate(next);
        // A credential follows the origin it was granted for, not a redirect.
        if (validated.origin !== url.origin) {
          headers = new Headers(headers);
          headers.delete('authorization');
        }
        url = validated;
        continue;
      }

      const declared = Number(response.headers.get('content-length') ?? '');
      if (Number.isFinite(declared) && declared > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new EgressBlockedError('ردّ الخادم أكبر من المسموح');
      }

      return response;
    }
  };

  return guarded as typeof fetch;
}

/** Reads a body with the size ceiling applied, for the callers that read JSON. */
export async function readCappedText(
  response: Response,
  maxBytes = EGRESS_MAX_RESPONSE_BYTES
): Promise<string> {
  const body = response.body;
  if (!body) return '';

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let read = 0;
  let text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      if (read > maxBytes) throw new EgressBlockedError('ردّ الخادم أكبر من المسموح');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return text + decoder.decode();
}
