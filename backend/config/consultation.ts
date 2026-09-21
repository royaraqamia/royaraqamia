import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createNotificationFanout, type NotificationFanout } from '@/backend/config/notifications';
import { createConsultationRepositories } from '@/backend/repositories/consultation';
import {
  ConsultationService,
  generateConsultationReferenceCode,
  type ConsultationBookingNotifier,
} from '@/backend/services/consultation/consultation-service';

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
 * Fire-and-forget: tells the Admin audience that a visitor booked a
 * consultation. There is no operator roster beyond `is_admin`, so admins are
 * the audience. Never throws — the booking is already committed by the time
 * this runs, and the shared fan-out owns one batched insert and push.
 */
export function createConsultationBookingNotifier(
  fanOut: NotificationFanout = createNotificationFanout()
): ConsultationBookingNotifier {
  return (booking) => {
    void fanOut({
      type: 'consultation_booking',
      title: 'طلب حجز استشارة جديد',
      body: `${booking.fullName} — ${booking.packageName ?? 'استشارة'} (${booking.referenceCode})`,
      metadata: {
        bookingId: booking.id,
        referenceCode: booking.referenceCode,
      },
    });
  };
}

/** Public booking page: create a request, list slots, read packages/settings. */
export function createPublicConsultationService(): ConsultationService {
  return createService(getAdminSupabase());
}

/** Full-privilege service for Admin-adapter-guarded endpoints. */
export function createAdminConsultationService(): ConsultationService {
  return createService(getAdminSupabase());
}
