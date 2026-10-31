'use client';

import { useCallback, useRef, useState } from 'react';
import { logger } from '@/frontend/shared/logger';
import { errorMessage } from '@/frontend/shared/local-store/sync-transport';

/**
 * A reconciliation with the server, and what to say when one fails (#369).
 *
 * The Outbox already reports its own state — pending intents, permanent
 * failures — and the pill has always shown it. A *pull* is the other half of
 * sync (ADR-0060) and had no state at all: every product caught its rejection,
 * logged it and returned, so a reader whose last reconciliation failed went on
 * looking at rows that could be arbitrarily old while the pill said nothing.
 * "Nothing to send" is not "up to date", and only one of the two was on screen.
 *
 * One hook, adopted by every product that pulls, so the fact is recorded where
 * it happens rather than reconstructed at the surface.
 */
export interface RefreshState {
  /** Why the last reconciliation failed, or `null` once one succeeds. */
  error: string | null;
  /**
   * Runs one reconciliation. A rejection is recorded and logged here, so the
   * caller's `catch` cannot swallow it by accident; the promise never rejects.
   */
  run: (task: () => Promise<unknown>, label: string) => Promise<void>;
  /** Runs the last reconciliation again — what the pill's retry button calls. */
  retry: () => void;
  /** Forgets the failure: a fresh identity, or a surface starting over. */
  clear: () => void;
}

export function useRefreshState(): RefreshState {
  const [error, setError] = useState<string | null>(null);
  // The task is remembered so a retry re-runs *the* pull that failed — the same
  // store, the same endpoint — rather than a second implementation of it.
  const lastAttempt = useRef<{ task: () => Promise<unknown>; label: string } | null>(null);

  const run = useCallback(async (task: () => Promise<unknown>, label: string) => {
    lastAttempt.current = { task, label };
    try {
      await task();
      setError(null);
    } catch (failure) {
      setError(errorMessage(failure));
      logger.error(label, { error: String(failure) });
    }
  }, []);

  const retry = useCallback(() => {
    const attempt = lastAttempt.current;
    if (attempt) void run(attempt.task, attempt.label);
  }, [run]);

  const clear = useCallback(() => {
    lastAttempt.current = null;
    setError(null);
  }, []);

  return { error, run, retry, clear };
}
