'use client';

import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';

/** The minimal sync shape any product's pill needs. */
export interface SyncPillStatus {
  syncing: boolean;
  pending: number;
  failed: number;
  online: boolean;
  retry: () => void;
}

/**
 * The always-visible sync state (ADR-0027). Connectivity persists whether or
 * not anything is queued, permanent failures are surfaced with a retry and
 * never swallowed; pending work shows while it waits for a connection. A
 * fully-synced, connected flow renders nothing at all.
 */
export function SyncStatusPill({ status }: { status: SyncPillStatus }) {
  const { syncing, pending, failed, online, retry } = status;

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

  if (!online) {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-zinc-300/80 dark:border-zinc-700/80 bg-zinc-100/80 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-300 text-xs sm:text-sm font-bold shadow-sm"
      >
        <CloudOff className="w-4 h-4" />
        <span>
          غير متَّصل
          {pending > 0 && ` — ${pending} بانتظار المزامنة`}
        </span>
      </span>
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
        <span>جارٍ المزامنة…</span>
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
        <span>بانتظار المزامنة ({pending})</span>
      </span>
    );
  }

  return null;
}
