'use client';

import { logger } from '@/frontend/shared/logger';
import { IS_PRODUCTION } from '@/frontend/shared/constants';
import { appVersion } from '@/backend/config/generated/app-version';

type InitOptions = {
  dsn?: string;
  environment?: string;
  release?: string;
  integrations?: unknown[];
  tunnel?: string;
  tracesSampleRate?: number;
};

type Reporter = {
  init: (options: InitOptions) => void;
  captureException: (error: unknown, hint?: { extra?: Record<string, unknown> }) => void;
};

declare global {
  interface Window {
    __RoyaSentry?: Reporter;
  }
}

type BufferedEvent = {
  error: unknown;
  context?: Record<string, unknown>;
};

const MAX_BUFFERED_EVENTS = 5;
const REPORTER_URL = '/sentry-client.js';

let reporterPromise: Promise<Reporter> | null = null;
let buffered: BufferedEvent[] = [];
let initialized = false;
let handlersInstalled = false;

/**
 * Load the standalone reporter bundle only after something has gone wrong.
 *
 * A `import('@sentry/browser')` here would not be lazy: Turbopack emits every
 * reachable dynamic import as a `<script async>` in prerendered HTML, so the
 * SDK was fetched on every route (#1820). A script appended at runtime has no
 * tag in the document, is fetched on demand, and is priced by the
 * browser-sourced `perf:runtime` gate.
 */
function loadReporter(): Promise<Reporter> {
  if (reporterPromise) return reporterPromise;
  reporterPromise = new Promise<Reporter>((resolve, reject) => {
    if (window.__RoyaSentry) {
      resolve(window.__RoyaSentry);
      return;
    }
    const script = document.createElement('script');
    script.src = REPORTER_URL;
    script.async = true;
    script.onload = () => {
      const reporter = window.__RoyaSentry;
      if (reporter) resolve(reporter);
      else reject(new Error(`${REPORTER_URL} did not expose window.__RoyaSentry`));
    };
    script.onerror = () => reject(new Error(`Could not load ${REPORTER_URL}`));
    document.head.appendChild(script);
  });
  return reporterPromise;
}

/**
 * Buffer the first events, then boot the SDK once to send everything collected
 * so far. A visit with no error never requests the reporter.
 */
function report(error: unknown, context?: Record<string, unknown>): void {
  buffered.push({ error, context });
  if (buffered.length > MAX_BUFFERED_EVENTS) buffered.shift();

  void loadReporter()
    .then((reporter) => {
      if (!initialized) {
        reporter.init({
          dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
          release: appVersion.releaseVersion,
          integrations: [],
          // Sentry events leave the browser through the `/monitoring` tunnel;
          // direct calls to sentry.io are blocked by the CSP.
          tunnel: '/monitoring',
          // Client transactions are the highest-volume, lowest-signal events,
          // so they are sampled hard when the SDK is booted by an exception.
          // Exceptions are not sampled.
          tracesSampleRate: IS_PRODUCTION ? 0.01 : 0,
        });
        initialized = true;
      }
      const events = buffered;
      buffered = [];
      for (const event of events) {
        reporter.captureException(
          event.error,
          event.context ? { extra: event.context } : undefined
        );
      }
    })
    .catch((captureError) => {
      buffered = [];
      logger.error('Failed to report to Sentry', { error: (captureError as Error).message });
    });
}

/**
 * Install only first-party listeners at boot. Neither listener loads the SDK;
 * the buffer above does that when there is something worth sending.
 */
export function initClientSentry(): void {
  if (typeof window === 'undefined') return;
  if (!IS_PRODUCTION) return;
  if (handlersInstalled) return;
  handlersInstalled = true;

  window.addEventListener('error', (event) => {
    // Resource-load failures have no Error object and would fill the buffer
    // with noise; application exceptions are the channel this reporter owns.
    if (event.error) report(event.error, { source: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    report(event.reason, { source: 'unhandledrejection' });
  });
}

export async function captureClientError(error: unknown, context?: Record<string, unknown>) {
  if (!IS_PRODUCTION) return;
  report(error, context);
}

/**
 * Next's hook stays exported. Sentry's navigation spans come from its browser
 * tracing integration, which `integrations: []` does not install, so there is
 * no span to capture and no reason to load the SDK on a clean navigation.
 */
export function captureRouterTransitionStart(_url: string, _navigationType: string): void {
  return;
}
