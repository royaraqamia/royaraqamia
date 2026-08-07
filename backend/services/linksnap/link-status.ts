import type { LinkStatus } from '@/shared/contracts/linksnap';

/**
 * Derives a link's lifecycle status from its moderation flag and expiry.
 *
 * Priority: a link that is both blocked and expired reads as blocked (the
 * redirect layer already short-circuits blocked links first).
 */
export function getLinkStatus(
  isBlocked: boolean,
  expiresAt: Date | null,
  now: Date = new Date()
): LinkStatus {
  if (isBlocked) return 'blocked';
  if (expiresAt && expiresAt.getTime() < now.getTime()) return 'expired';
  return 'active';
}
