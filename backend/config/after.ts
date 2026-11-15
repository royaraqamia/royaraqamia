import { after } from 'next/server';

import type { DeferredWork } from '@/backend/shared/deferred-work';

/**
 * Runs a task after the response is flushed. Uses Next.js `after()` when inside
 * a request scope (survives on Vercel serverless) and falls back to a plain
 * fire-and-forget microtask otherwise. Shared by every background task.
 */
export function runAfter(fn: () => void | Promise<void>): void {
  try {
    after(fn);
  } catch {
    void Promise.resolve().then(fn);
  }
}

/**
 * `runAfter` as the seam a service takes (ADR-0182, #1511).
 *
 * The promise has already started when it arrives — `after()` only keeps the
 * instance alive until it settles — which is exactly the shape the memory
 * extraction needs: it must run behind the answer, never in front of it.
 */
export const deferredAfter: DeferredWork = (promise) =>
  runAfter(async () => {
    await promise;
  });
