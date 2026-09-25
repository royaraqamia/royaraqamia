import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createNotificationFanout, type NotificationFanout } from '@/backend/config/notifications';
import { createRetainersRepository } from '@/backend/repositories/retainers';
import {
  createRetainerService,
  generateRetainerReferenceCode,
  type RetainerNotifier,
  type RetainerService,
} from '@/backend/services/retainers/retainers-service';

/**
 * Retainers are written and read exclusively through the service role: the
 * `retainers` table has no anon/authenticated access at all, because a
 * submission is anonymous and the admin list sits behind an admin-guarded route.
 */
export function createDefaultRetainerService(supabase?: SupabaseClient<Database>): RetainerService {
  return createRetainerService({
    repository: createRetainersRepository(supabase ?? getAdminSupabase()),
    checkRateLimit,
    generateReferenceCode: generateRetainerReferenceCode,
    notifyAdmins: createRetainerNotifier(),
    captureException: (error, options) => Sentry.captureException(error, options),
  });
}

/**
 * Fire-and-forget: tells the Admin audience a retainer request arrived. Never
 * throws — the row is already committed by the time this runs, and the shared
 * fan-out owns the Admin audience, the batched insert and the push fan-out.
 */
export function createRetainerNotifier(
  fanOut: NotificationFanout = createNotificationFanout()
): RetainerNotifier {
  return (retainer) => {
    void fanOut({
      type: 'retainer_request',
      title: 'طلب توظيف شهري جديد',
      body: `${retainer.full_name} — ${retainer.company ?? 'بدون شركة'} (${retainer.reference_code})`,
      metadata: {
        retainerId: retainer.id,
        referenceCode: retainer.reference_code,
        monthlyFeeUsd: retainer.monthly_fee_usd,
      },
    });
  };
}
