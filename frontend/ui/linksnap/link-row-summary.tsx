'use client';

import { Calendar, ExternalLink, Lock } from 'lucide-react';

import { LINK_ROW_SUMMARY_COPY } from './link-row-summary-copy';

import type { LinkStatus } from '@/shared/contracts/linksnap';
import { cn } from '@/frontend/shared/cn';

/**
 * The owned link's resting details (#941): the code chip, the status pill, the
 * protected pill, the Hijri date pill and the destination.
 *
 * The row's actions, its selection checkbox and its dialogs are other slices;
 * this is the part a member reads at rest, and the part the app draws natively
 * for `account-links`. The words come from the generated copy source both
 * clients read (ADR-0098), and `data-visual` names the boxes the visual gate
 * measures (`shared/visual/account-links.json`).
 */
const STATUS_LABEL: Record<LinkStatus, string> = {
  active: LINK_ROW_SUMMARY_COPY.statusActive,
  expired: LINK_ROW_SUMMARY_COPY.statusExpired,
  blocked: LINK_ROW_SUMMARY_COPY.statusBlocked,
};

const STATUS_CLASS: Record<LinkStatus, { pill: string; dot: string }> = {
  active: {
    pill: 'text-emerald-700 bg-emerald-50/80 border-emerald-200/60 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800/50',
    dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]',
  },
  expired: {
    pill: 'text-neutral-600 bg-neutral-100/80 border-neutral-200/60 dark:text-neutral-400 dark:bg-neutral-800/60 dark:border-neutral-700/50',
    dot: 'bg-neutral-400 dark:bg-neutral-500',
  },
  blocked: {
    pill: 'text-rose-700 bg-rose-50/80 border-rose-200/60 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-800/50',
    dot: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]',
  },
};

interface LinkRowSummaryProps {
  code: string;
  originalUrl: string;
  createdAt: string;
  status: LinkStatus;
  expiresAt: string | null;
  passwordProtected?: boolean;
  onOpen: () => void;
}

export function LinkRowSummary({
  code,
  originalUrl,
  createdAt,
  status,
  expiresAt,
  passwordProtected = false,
  onOpen,
}: LinkRowSummaryProps) {
  const meta = STATUS_CLASS[status] ?? STATUS_CLASS.active;

  return (
    <div data-visual="link-row-summary" className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-visual="link-row-code"
          onClick={onOpen}
          className={cn(
            'group/code inline-flex items-center gap-1.5 rounded-lg border border-neutral-200/80 bg-neutral-100/70 px-2.5 py-1 font-mono text-sm font-bold tracking-tight text-neutral-900 transition-safe duration-200',
            'hover:border-blue-500/40 hover:bg-blue-50/50 hover:text-blue-600 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-100 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/30 dark:hover:text-blue-400',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-100 dark:focus-visible:ring-offset-neutral-950'
          )}
        >
          <span>/{code}</span>
          <ExternalLink
            aria-hidden="true"
            className="h-3 w-3 opacity-40 transition-opacity duration-200 group-hover/code:opacity-100"
          />
        </button>

        <span
          data-visual="link-row-status"
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-safe duration-200',
            meta.pill
          )}
          title={expiresAt ? `ينتهي في ${expiresAt}` : undefined}
        >
          <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
          {STATUS_LABEL[status] ?? STATUS_LABEL.active}
        </span>

        {passwordProtected && (
          <span
            data-visual="link-row-protected"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-50/80 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-400"
            title="هذا الرَّابط محمي بكلمة مرور"
          >
            <Lock aria-hidden="true" className="h-3 w-3" />
            {LINK_ROW_SUMMARY_COPY.protectedLabel}
          </span>
        )}

        <span
          data-visual="link-row-date"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200/70 bg-neutral-50/80 px-2.5 py-0.5 text-xs font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400"
        >
          <Calendar aria-hidden="true" className="h-3 w-3 text-neutral-400 dark:text-neutral-500" />
          {new Intl.DateTimeFormat('ar-SA', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            calendar: 'islamic-umalqura',
            numberingSystem: 'latn',
          }).format(new Date(createdAt))}
        </span>
      </div>

      <p
        data-visual="link-row-destination"
        className="truncate text-[13px] leading-relaxed text-neutral-500 transition-colors duration-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
        title={originalUrl}
      >
        {originalUrl}
      </p>
    </div>
  );
}
