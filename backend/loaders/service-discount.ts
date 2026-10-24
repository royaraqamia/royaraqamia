import 'server-only';

import { createUsageService } from '@/backend/config/plans';
import { logger } from '@/backend/shared/logger';
import { isProSubscriber } from '@/shared/service-pricing';

/**
 * The viewer's discount eligibility for a page that already resolved a
 * session, so the price is right in the first paint.
 *
 * `undefined` means the plan read failed; the client provider then resolves it
 * in the browser instead of hiding a paid benefit behind a broken query.
 */
export async function loadServiceDiscount(
  userId: string | null | undefined
): Promise<boolean | undefined> {
  if (!userId) return false;

  try {
    const state = await createUsageService().state(userId);
    return isProSubscriber(state.plan, state.unlimited);
  } catch (error) {
    logger.warn('Service discount plan read failed; deferring to the client', {
      error: String(error),
    });
    return undefined;
  }
}
