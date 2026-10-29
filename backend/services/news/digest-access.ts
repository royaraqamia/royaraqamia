import { createPlanGate } from '@/backend/config/plans';
import { UsageLimitReachedError } from '@/backend/services/plans/usage-service';
import type { PlanSubject } from '@/backend/services/plans/plan-gate';
import { logger } from '@/backend/shared/logger';
import { USAGE_COUNTERS } from '@/shared/contracts/plans';
import type { NewsDigestLimit } from '@/shared/contracts/news';

/**
 * Count one opened digest against the reader's daily allowance.
 *
 * The digest is the unit, not the page: re-opening the same day's digest (a
 * refresh, a Realtime update) is deduplicated by its date, while moving through
 * the archive costs one per day opened. A refusal is returned rather than
 * thrown, because the route's job is to say "you have seen your five today"
 * instead of failing the read.
 *
 * A database hiccup answers `null` — the page stays readable. The board is
 * public content and the allowance is abuse friction, not a paywall; a read
 * that breaks because the counter broke would be the worse failure.
 */
export async function claimNewsDigestOpen(
  subject: PlanSubject,
  digestDate: string | null
): Promise<NewsDigestLimit | null> {
  if (!digestDate) return null;

  try {
    await createPlanGate().claim(subject, USAGE_COUNTERS.newsDigests, {
      dedupeKey: `news:${digestDate}`,
    });
    return null;
  } catch (error) {
    if (error instanceof UsageLimitReachedError) {
      return { cap: error.state.cap, used: error.state.used, visitor: error.visitor };
    }

    logger.warn('Failed to count an opened news digest', { error: String(error) });
    return null;
  }
}
