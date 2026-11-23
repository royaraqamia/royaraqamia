import { NextRequest } from 'next/server';
import { env } from '@/backend/config/env';

/**
 * The origin sits behind Cloudflare (ADR-0174). Every request the edge forwards
 * carries `cf-ray`, and `cf-connecting-ip` is the address Cloudflare resolved
 * for the visitor. The marker is the proof: an address header without its
 * proxy's own marker is client input and must never become a rate-limit key.
 *
 * The marker and the address belong together. Add a pair here when the front
 * hop changes — this table is the only place that names either, so a host move
 * cannot leave an old header trusted in one caller and not another.
 */
const TRUSTED_EDGES = [{ marker: 'cf-ray', address: 'cf-connecting-ip' }] as const;

/** Without a proxy marker there is no trustworthy address; callers share the peer bucket. */
const LOCAL_ADDRESS = '127.0.0.1';

/**
 * Resolve the visitor's address from the headers the current edge sets.
 *
 * `x-real-ip` and `x-forwarded-for` are deliberately not consulted. Behind the
 * CDN they name the proxy hop (one address for every visitor behind it); with
 * no CDN they are supplied by the client. Both made the ceiling unenforceable
 * against one caller and spendable by another (issue #1666).
 */
export function clientAddress(headers: Headers): string {
  for (const edge of TRUSTED_EDGES) {
    if (!headers.get(edge.marker)) continue;
    const address = headers.get(edge.address)?.trim();
    if (address) return address;
  }
  return LOCAL_ADDRESS;
}

/** For handlers that hold a request rather than its headers. */
export function getClientIp(req: NextRequest): string {
  return clientAddress(req.headers);
}

/**
 * CSRF guard for browser-driven POST endpoints: a cross-site form/JS POST
 * carries the victim's session cookie, so without this an attacker could forge
 * state-changing requests under the victim's session. Only accept requests that
 * are provably same-origin.
 */
export function isSameOrigin(headers: Headers): boolean {
  if (headers.get('sec-fetch-site') === 'same-origin') return true;
  const origin = headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(env.origin).origin;
  } catch {
    return false;
  }
}
