import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createAdminNotificationProducer } from '@/backend/config/notifications';
import { createConsultationRepositories } from '@/backend/repositories/consultation';
import {
  ConsultationService,
  generateConsultationReferenceCode,
  type ConsultationBookingNotifier,
} from '@/backend/services/consultation/consultation-service';
import { logger } from '@/backend/shared/logger';

/**
 * Bookings are anonymous and unpaid, so the `consultation_bookings` tables
 * grant nothing to anon/authenticated. Every path — public booking and admin
 * management alike — runs on the service role for that reason.
 */
function createService(supabase: SupabaseClient<Database>): ConsultationService {
  return new ConsultationService(createConsultationRepositories(supabase), {
    nowIso: () => new Date().toISOString(),
    checkRateLimit,
    generateReferenceCode: generateConsultationReferenceCode,
    notifyAdmins: createConsultationBookingNotifier(),
    captureException: (error, options) => Sentry.captureException(error, options),
  });
}

/**
 * Fire-and-forget: tells every admin user that a visitor booked a consultation.
 * There is no operator roster beyond `is_admin`, so admins are the audience.
 * Never throws — the booking is already committed by the time this runs.
 */
export function createConsultationBookingNotifier(): ConsultationBookingNotifier {
  const notify = createAdminNotificationProducer();
  return (booking) => {
    void (async () => {
      try {
        const { data } = await getAdminSupabase().from('users').select('id').eq('is_admin', true);
        const adminIds = (data ?? []).map((row) => row.id);

        await Promise.all(
          adminIds.map((userId) =>
            notify({
              user_id: userId,
              type: 'consultation_booking',
              title: 'طلب حجز استشارة جديد',
              body: `${booking.fullName} — ${booking.packageName ?? 'استشارة'} (${
                booking.referenceCode
              })`,
              metadata: {
                bookingId: booking.id,
                referenceCode: booking.referenceCode,
              },
            })
          )
        );
      } catch (err) {
        logger.error('Failed to notify admins about a consultation booking', {
          error: String(err),
        });
      }
    })();
  };
}

/** Public booking page: create a request, list slots, read packages/settings. */
export function createPublicConsultationService(): ConsultationService {
  return createService(getAdminSupabase());
}

/** Full-privilege service for requireAdminAuth-guarded endpoints. */
export function createAdminConsultationService(): ConsultationService {
  return createService(getAdminSupabase());
}
