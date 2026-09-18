import { NextRequest } from 'next/server';
import { env } from '@/backend/config/env';

/**
 * Resolves the client IP used for rate limiting. `x-real-ip` is set by the
 * platform and cannot be forged by the client, so it wins. `x-forwarded-for`
 * may carry a client-supplied prefix, so when `x-real-ip` is absent the *last*
 * hop (the one appended by the nearest trusted proxy) is used instead of the
 * spoofable first entry.
 */
export function getClientIp(req: NextRequest): string {
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    const nearestHop = hops[hops.length - 1];
    if (nearestHop) return nearestHop;
  }

  return '127.0.0.1';
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
    return new URL(origin).origin === new URL(env.baseUrl).origin;
  } catch {
    return false;
  }
}
