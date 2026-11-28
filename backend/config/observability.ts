import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createPerfSamplesRepository } from '@/backend/repositories/observability/perf-samples-repository';
import {
  AppFailureService,
  type AppFailureContext,
  type AppFailureSource,
} from '@/backend/services/observability/app-failure-service';
import { AppPerfService } from '@/backend/services/observability/app-perf-service';

/**
 * The app's failures land in the same Sentry project as the web's (#667), under
 * their own fingerprint prefix (`app-failure/<kind>/<reason>`) so a native issue
 * is told apart from a browser's at a glance, and `sentry.server.config.ts`'s
 * release still answers "which deploy received it".
 *
 * `captureMessage` rather than `captureException`: what arrives is a report, not
 * a throwable — the stack is the app's own text, and pretending otherwise would
 * hand Sentry a frame list it would try to symbolicate against the server's
 * source.
 */
const sentrySource: AppFailureSource = {
  capture(message: string, context: AppFailureContext) {
    Sentry.captureMessage(message, context);
  },
};

export function createAppFailureService(): AppFailureService {
  return new AppFailureService({ failures: sentrySource });
}

/**
 * The perf beacon's sink (#1885, ADR-0228). The row is written with the service
 * role because the table grants nothing to a client role and has no policy: the
 * record is telemetry, not a member's data.
 */
export function createAppPerfService(supabase?: SupabaseClient<Database>): AppPerfService {
  return new AppPerfService({
    samples: createPerfSamplesRepository(supabase ?? getAdminSupabase()),
  });
}
