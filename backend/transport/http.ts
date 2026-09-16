import { NextRequest } from 'next/server';
import { env } from '@/backend/config/env';

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
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
