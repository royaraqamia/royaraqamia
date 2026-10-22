import { captureRouterTransitionStart, initClientSentry } from '@/frontend/shared/sentry';
import { markBoot } from '@/frontend/shared/perf-marks';

// The launch measurement (#487) starts here: this module is the earliest client
// code of a launch, before hydration. Never awaited, never throws.
markBoot();

initClientSentry();

export const onRouterTransitionStart = captureRouterTransitionStart;
