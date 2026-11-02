import * as Sentry from '@sentry/nextjs';

import {
  AppFailureService,
  type AppFailureContext,
  type AppFailureSource,
} from '@/backend/services/observability/app-failure-service';

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
