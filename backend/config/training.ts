import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createAdminBroadcaster } from '@/backend/config/notifications';
import { createTrainingApplicationsRepository } from '@/backend/repositories/training';
import {
  createTrainingApplicationService,
  generateTrainingReferenceCode,
  type TrainingApplicationNotifier,
  type TrainingApplicationService,
} from '@/backend/services/training/training-application-service';
import { TRAINING_COURSE } from '@/shared/contracts/training';
import { createConcurrencyLimiter } from '@/backend/shared/concurrency-limiter';
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

// Admin ids change rarely; a short TTL removes one query per submission when a
// burst of 100+ students applies at once, while still picking up roster changes.
const ADMIN_IDS_TTL_MS = 60_000;
let adminIdsCache: { ids: string[]; expiresAt: number } | null = null;

// Caps how many notification fan-outs run concurrently. A burst of applications
// would otherwise launch one broadcast+push job per submission at the same time.
const runNotification = createConcurrencyLimiter(5);

async function getAdminIds(): Promise<string[]> {
  const now = Date.now();
  if (adminIdsCache && now < adminIdsCache.expiresAt) return adminIdsCache.ids;

  const { data } = await getAdminSupabase().from('users').select('id').eq('is_admin', true);
  const ids = (data ?? []).map((row) => row.id);
  adminIdsCache = { ids, expiresAt: now + ADMIN_IDS_TTL_MS };
  return ids;
}

/**
 * Fire-and-forget: tells every admin user that a student applied. There is no
 * operator roster beyond `is_admin`, so admins are the audience. Never throws —
 * the application is already committed by the time this runs.
 *
 * Uses a single batched broadcast (one row insert + one push fan-out) instead of
 * one notification call per admin, so a burst of applications does not multiply
 * writes per admin.
 */
export function createTrainingApplicationNotifier(): TrainingApplicationNotifier {
  const broadcast = createAdminBroadcaster();
  return (application) => {
    void runNotification(async () => {
      try {
        const adminIds = await getAdminIds();
        if (adminIds.length === 0) return;

        await broadcast(
          {
            type: 'training_application',
            title: 'طلب التحاق جديد بالدورة',
            body: `${application.full_name} — ${TRAINING_COURSE.title} (${application.reference_code})`,
            metadata: {
              applicationId: application.id,
              referenceCode: application.reference_code,
              courseSlug: application.course_slug,
            },
          },
          adminIds
        );
      } catch (err) {
        logger.error('Failed to notify admins about a training application', {
          error: String(err),
        });
      }
    });
  };
}
