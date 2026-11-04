import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createNotificationFanout, type NotificationFanout } from '@/backend/config/notifications';
import { createSubscriptionRequestsRepository } from '@/backend/repositories/subscriptions';
import {
  SubscriptionRequestService,
  generateSubscriptionReferenceCode,
  type SubscriptionRequestNotifier,
} from '@/backend/services/subscriptions/subscriptions-service';

/**
 * Subscription requests are written and read exclusively through the service
 * role: the table has no anon/authenticated access at all, because the Admin
 * list sits behind an admin-guarded route and the submit route proves the
 * account itself before it writes.
 */
export function createDefaultSubscriptionRequestService(
  supabase?: SupabaseClient<Database>
): SubscriptionRequestService {
  return new SubscriptionRequestService({
    repository: createSubscriptionRequestsRepository(supabase ?? getAdminSupabase()),
    checkRateLimit,
    generateReferenceCode: generateSubscriptionReferenceCode,
    notifyAdmins: createSubscriptionRequestNotifier(),
    captureException: (error, options) => Sentry.captureException(error, options),
  });
}

/**
 * Fire-and-forget: tells the Admin audience a request arrived. Never throws —
 * the row is already committed by the time this runs, and the shared fan-out
 * owns the Admin audience, the batched insert and the push fan-out.
 */
export function createSubscriptionRequestNotifier(
  fanOut: NotificationFanout = createNotificationFanout()
): SubscriptionRequestNotifier {
  return (request, event) => {
    const isUpdate = event === 'updated';
    void fanOut({
      type: 'subscription_request',
      title: isUpdate ? 'تحديث طلب اشتراك' : 'طلب اشتراك جديد',
      body: isUpdate
        ? `${request.full_name} — ${request.status} (${request.reference_code})`
        : `${request.full_name} — الخطَّة المدفوعة (${request.reference_code})`,
      metadata: {
        subscriptionRequestId: request.id,
        referenceCode: request.reference_code,
        event,
      },
    });
  };
}
