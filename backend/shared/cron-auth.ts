import { timingSafeEqual } from 'node:crypto';

import { env } from '@/backend/config/env';

/**
 * Vercel Cron authenticates with `Authorization: Bearer <CRON_SECRET>`. The
 * comparison is constant-time so a wrong token cannot be guessed byte by byte,
 * and an unset secret refuses everything rather than accepting a blank one.
 */
export function isCronAuthorized(headers: Headers): boolean {
  const expected = env.cronSecret;
  if (!expected) return false;

  const supplied = headers.get('authorization') ?? '';
  const token = supplied.startsWith('Bearer ') ? supplied.slice('Bearer '.length) : '';

  return (
    token.length === expected.length &&
    token.length > 0 &&
    timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  );
}
