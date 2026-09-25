import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createNotificationFanout, type NotificationFanout } from '@/backend/config/notifications';
import { createProjectRequestsRepository } from '@/backend/repositories/project-requests';
import {
  createProjectRequestService,
  generateProjectRequestReferenceCode,
  type ProjectRequestNotifier,
  type ProjectRequestService,
} from '@/backend/services/project-requests/project-requests-service';
import { PROJECT_REQUEST_TYPE_LABELS } from '@/shared/contracts/project-requests';

/**
 * Requests are written and read exclusively through the service role: the
 * `project_requests` table has no anon/authenticated access at all, because a
 * submission is anonymous and the admin list sits behind an admin-guarded route.
 */
export function createDefaultProjectRequestService(
  supabase?: SupabaseClient<Database>
): ProjectRequestService {
  return createProjectRequestService({
    repository: createProjectRequestsRepository(supabase ?? getAdminSupabase()),
    checkRateLimit,
    generateReferenceCode: generateProjectRequestReferenceCode,
    notifyAdmins: createProjectRequestNotifier(),
    captureException: (error, options) => Sentry.captureException(error, options),
  });
}

/**
 * Fire-and-forget: tells the Admin audience a project request arrived. Never
 * throws — the row is already committed by the time this runs, and the shared
 * fan-out owns the Admin audience, the batched insert and the push fan-out.
 */
export function createProjectRequestNotifier(
  fanOut: NotificationFanout = createNotificationFanout()
): ProjectRequestNotifier {
  return (request) => {
    void fanOut({
      type: 'project_request',
      title: 'طلب مشروع جديد',
      body: `${request.full_name} — ${PROJECT_REQUEST_TYPE_LABELS[request.project_type]} (${request.reference_code})`,
      metadata: {
        projectRequestId: request.id,
        referenceCode: request.reference_code,
        projectType: request.project_type,
      },
    });
  };
}
