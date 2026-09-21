import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createNotificationFanout, type NotificationFanout } from '@/backend/config/notifications';
import { createTrainingApplicationsRepository } from '@/backend/repositories/training';
import {
  createTrainingApplicationService,
  generateTrainingReferenceCode,
  type TrainingApplicationNotifier,
  type TrainingApplicationService,
} from '@/backend/services/training/training-application-service';
import { TRAINING_COURSE } from '@/shared/contracts/training';

/**
 * Applications are written and read exclusively through the service role: the
 * `training_applications` table has no anon/authenticated access at all, because
 * a submission is anonymous and the admin list sits behind an admin-guarded route.
 */
export function createDefaultTrainingApplicationService(
  supabase?: SupabaseClient<Database>
): TrainingApplicationService {
  return createTrainingApplicationService({
    repository: createTrainingApplicationsRepository(supabase ?? getAdminSupabase()),
    checkRateLimit,
    generateReferenceCode: generateTrainingReferenceCode,
    isApplicationOpen: () => TRAINING_COURSE.isOpen,
    notifyAdmins: createTrainingApplicationNotifier(),
    captureException: (error, options) => Sentry.captureException(error, options),
  });
}

/**
 * Fire-and-forget: tells the Admin audience that a student applied. There is no
 * operator roster beyond `is_admin`, so admins are the audience. Never throws —
 * the application is already committed by the time this runs.
 *
 * The shared fan-out owns the Admin audience (and its cache), the single
 * batched insert and the single push fan-out, so a burst of applications does
 * not multiply work per admin.
 */
export function createTrainingApplicationNotifier(
  fanOut: NotificationFanout = createNotificationFanout()
): TrainingApplicationNotifier {
  return (application) => {
    void fanOut({
      type: 'training_application',
      title: 'طلب التحاق جديد بالدورة',
      body: `${application.full_name} — ${TRAINING_COURSE.title} (${application.reference_code})`,
      metadata: {
        applicationId: application.id,
        referenceCode: application.reference_code,
        courseSlug: application.course_slug,
      },
    });
  };
}
