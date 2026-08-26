'use client';

import { logger } from '@/frontend/shared/logger';
import { IS_PRODUCTION } from '@/frontend/shared/constants';
import { appVersion } from '@/backend/config/generated/app-version';

type SentryModule = typeof import('@sentry/nextjs');

let sentryPromise: Promise<SentryModule> | null = null;

function loadSentry(): Promise<SentryModule> {
  if (!sentryPromise) {
    sentryPromise = import('@sentry/nextjs').then((sentry) => {
      sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
        release: appVersion.releaseVersion,
        integrations: [],
        tracesSampleRate: IS_PRODUCTION ? 0.1 : 0,
      });
      return sentry;
    });
  }
  return sentryPromise;
}

type IdleSchedulingWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

/**
 * Boots the client Sentry SDK outside the critical render path so the SDK
 * never blocks hydration. NOTE (measured on Next 16 / Turbopack): the async
 * chunk still appears as a non-blocking <script async> in prerendered HTML
 * (~71KB gz) because Turbopack emits every reachable dynamic import upfront;
 * execution — not download — is what we defer here. In production the SDK
 * starts after the browser is first idle; in development it stays lazy until
 * an error is captured so hot-reload iterating stays fast.
 */
export function initClientSentry(): void {
  if (typeof window === 'undefined') return;

  if (!IS_PRODUCTION) return;

  const callback = () => {
    void loadSentry().catch();
  };

  const idleWindow = window as IdleSchedulingWindow;
  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(callback, { timeout: 3000 });
  } else {
    (window as Window).setTimeout(callback, 2000);
  }
}

export async function captureClientError(error: unknown, context?: Record<string, unknown>) {
  if (!IS_PRODUCTION) return;
  try {
    const sentry = await loadSentry();
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch (captureError) {
    logger.error('Failed to report to Sentry', { error: (captureError as Error).message });
  }
}

export async function captureRouterTransitionStart(url: string, navigationType: string) {
  if (!IS_PRODUCTION) return;
  try {
    const sentry = await loadSentry();
    sentry.captureRouterTransitionStart(url, navigationType);
  } catch (captureError) {
    logger.error('Failed to report router transition to Sentry', {
      error: (captureError as Error).message,
    });
  }
}
