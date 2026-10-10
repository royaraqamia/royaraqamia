'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { HabitSyncState } from '@/frontend/state/habitflow/use-habit-sync';

/**
 * The always-visible sync state (ADR-0027). Permanent failures are surfaced
 * with a retry, never swallowed; pending work shows while it waits for a
 * connection. A fully-synced habit flow renders nothing at all.
 */
export function SyncStatusPill({ status }: { status: HabitSyncState }) {
  const { syncing, pending, failed, retry } = status;

  if (failed > 0) {
    return (
      <button
        type="button"
        onClick={retry}
        aria-live="polite"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-red-300/70 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs sm:text-sm font-bold shadow-sm transition-safe hover:bg-red-100 dark:hover:bg-red-950/70 active:scale-[0.97] cursor-pointer"
      >
        <AlertTriangle className="w-4 h-4" />
        <span>فشل مزامنة {failed} — إعادة المحاولة</span>
      </button>
    );
  }

  if (syncing) {
    return (
      <span
        aria-live="polite"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-zinc-200/80 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-300 text-xs sm:text-sm font-bold shadow-sm"
      >
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>جارٍ المزامنة…</span>
      </span>
    );
  }

  if (pending > 0) {
    return (
      <span
        aria-live="polite"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-amber-300/70 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs sm:text-sm font-bold shadow-sm"
      >
        <span>بانتظار المزامنة ({pending})</span>
      </span>
    );
  }

  return null;
}
