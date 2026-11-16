import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');

    // ADR-0199: one boot line and a memory sample every five minutes, so a
    // restart can be dated from the log stream instead of an emailed warning.
    const { noteBoot, startMemoryTrace } = await import('@/backend/shared/runtime-watch');
    await noteBoot();
    startMemoryTrace();
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
