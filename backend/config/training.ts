import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createAdminNotificationProducer } from '@/backend/config/notifications';
import { createTrainingApplicationsRepository } from '@/backend/repositories/training';
import {
  createTrainingApplicationService,
  generateTrainingReferenceCode,
  type TrainingApplicationNotifier,
  type TrainingApplicationService,
} from '@/backend/services/training/training-application-service';
import { TRAINING_COURSE } from '@/shared/contracts/training';
import { logger } from '@/backend/shared/logger';

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
 * Fire-and-forget: tells every admin user that a student applied. There is no
 * operator roster beyond `is_admin`, so admins are the audience. Never throws —
 * the application is already committed by the time this runs.
 */
export function createTrainingApplicationNotifier(): TrainingApplicationNotifier {
  const notify = createAdminNotificationProducer();
  return (application) => {
    void (async () => {
      try {
        const { data } = await getAdminSupabase().from('users').select('id').eq('is_admin', true);
        const adminIds = (data ?? []).map((row) => row.id);

        await Promise.all(
          adminIds.map((userId) =>
            notify({
              user_id: userId,
              type: 'training_application',
              title: 'طلب التحاق جديد بالدورة',
              body: `${application.full_name} — ${TRAINING_COURSE.title} (${application.reference_code})`,
              metadata: {
                applicationId: application.id,
                referenceCode: application.reference_code,
                courseSlug: application.course_slug,
              },
            })
          )
        );
      } catch (err) {
        logger.error('Failed to notify admins about a training application', {
          error: String(err),
        });
      }
    })();
  };
}
