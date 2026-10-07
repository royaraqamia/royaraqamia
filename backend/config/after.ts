import { after } from 'next/server';

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
