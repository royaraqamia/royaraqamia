'use client';

import { TriangleAlert, CloudOff, RefreshCw } from 'lucide-react';
import { SYNC_PILL_COPY } from './sync-status-pill-copy';

/** The minimal sync shape any product's pill needs. */
export interface SyncPillStatus {
  syncing: boolean;
  pending: number;
  failed: number;
  online: boolean;
  retry: () => void;
  /** Last permanent failure, surfaced as the retry button's tooltip. */
  lastError?: string | null;
  lastFailedType?: string | null;
  /**
   * Why the last pull from the server failed (#369). A failed *refresh* is not a
   * failed write: nothing is queued, nothing is lost, and the rows on screen may
   * simply be older than the account's. It gets its own state so the copy can say
   * which of the two happened.
   */
  refreshError?: string | null;
  /** Re-runs the pull that failed — supplied by the hook that made the request. */
  retryRefresh?: () => void;
}

/**
 * The always-visible sync state (ADR-0027). Connectivity persists whether or
 * not anything is queued, permanent failures are surfaced with a retry and
 * never swallowed; pending work shows while it waits for a connection. A
 * fully-synced, connected flow renders nothing at all.
 */
export function SyncStatusPill({ status }: { status: SyncPillStatus }) {
  const { syncing, pending, failed, online, retry, lastError, lastFailedType } = status;
  const { refreshError, retryRefresh } = status;
  const failureDetail = [lastFailedType, lastError].filter(Boolean).join(' — ');

  if (failed > 0) {
    return (
      <button
        type="button"
        onClick={retry}
        title={failureDetail || undefined}
        aria-label={failureDetail ? SYNC_PILL_COPY.retryFailed : undefined}
        aria-live="polite"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-red-300/70 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs sm:text-sm font-bold shadow-sm transition-safe hover:bg-red-100 dark:hover:bg-red-950/70 active:scale-[0.97] cursor-pointer"
      >
        <TriangleAlert className="w-4 h-4" />
        <span>{SYNC_PILL_COPY.failed.replace('{count}', String(failed))}</span>
      </button>
    );
  }

  if (!online) {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-zinc-300/80 dark:border-zinc-700/80 bg-zinc-100/80 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-300 text-xs sm:text-sm font-bold shadow-sm"
      >
        <CloudOff className="w-4 h-4" />
        <span>{SYNC_PILL_COPY.offline}</span>
        {pending > 0 && (
          <span>{SYNC_PILL_COPY.offlinePending.replace('{count}', String(pending))}</span>
        )}
      </span>
    );
  }

  // A pull that failed outranks "syncing" and "pending": those describe work
  // leaving this device, and this describes work that never arrived. A queued
  // write still outranks both, and is handled above.
  if (refreshError && retryRefresh) {
    return (
      <button
        type="button"
        onClick={retryRefresh}
        title={refreshError}
        aria-label={SYNC_PILL_COPY.refreshFailed}
        aria-live="polite"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-amber-300/70 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs sm:text-sm font-bold shadow-sm transition-safe hover:bg-amber-100 dark:hover:bg-amber-950/70 active:scale-[0.97] cursor-pointer"
      >
        <RefreshCw className="w-4 h-4" />
        <span>{SYNC_PILL_COPY.refreshFailed}</span>
      </button>
    );
  }

  if (syncing) {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-zinc-200/80 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-300 text-xs sm:text-sm font-bold shadow-sm"
      >
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>{SYNC_PILL_COPY.syncing}</span>
      </span>
    );
  }

  if (pending > 0) {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-amber-300/70 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs sm:text-sm font-bold shadow-sm"
      >
        <span>{SYNC_PILL_COPY.pending.replace('{count}', String(pending))}</span>
      </span>
    );
  }

  return null;
}
