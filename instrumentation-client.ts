import { captureRouterTransitionStart, initClientSentry } from '@/frontend/shared/sentry';

initClientSentry();

export const onRouterTransitionStart = captureRouterTransitionStart;
