'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles, Wallet } from 'lucide-react';

import { Badge } from '@/frontend/ui/primitives/badge';
import { useMyUsage } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';
import { formatCount } from '@/frontend/shared/format';

const PLAN_LABELS = { free: 'الخطة المجانيَّة', pro: 'الخطة المدفوعة' } as const;

/**
 * The member's counted actions at a glance: downloads, digests opened, scans and
 * surah reads, each against its own cap. There is no shared balance to show any
 * more — one number per action is what the plan actually enforces (ADR-0093) —
 * and owned-item caps stay where they bind, at the moment something is created.
 *
 * Nothing renders for a visitor: the card is the account's own data, and the
 * pricing page is where a guest learns what a plan would give them.
 */
export function UsageCard() {
  const { user, isLoading: sessionLoading } = useSession();
  const enabled = Boolean(user) && !sessionLoading;
  const { state, loading, failed, reload } = useMyUsage(enabled);

  if (sessionLoading || !user) return null;

  return (
    <section
      aria-label="استهلاكك في الفترة الحالية"
      className="rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5"
    >
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-sm font-bold text-foreground sm:text-base">
          <Wallet className="size-4 shrink-0 text-primary" aria-hidden="true" />
          الاستهلاك
        </span>
        {state && (
          <Badge variant={state.unlimited || state.plan === 'pro' ? 'success' : 'secondary'}>
            {state.unlimited ? 'غير محدود' : PLAN_LABELS[state.plan]}
          </Badge>
        )}
      </header>

      {loading && !state && (
        <div className="mt-4 space-y-2" aria-busy="true" aria-label="جاري تحميل الاستهلاك">
          <div className="h-4 w-40 rounded-lg bg-muted/60 animate-pulse" />
          <div className="h-4 w-32 rounded-lg bg-muted/60 animate-pulse" />
          <div className="h-4 w-36 rounded-lg bg-muted/60 animate-pulse" />
        </div>
      )}

      {!loading && failed && !state && (
        <p className="mt-3 text-xs text-muted-foreground">
          تعذّر تحميل استهلاكك.{' '}
          <button
            type="button"
            onClick={() => void reload()}
            className="font-bold text-primary underline-offset-4 hover:underline"
          >
            إعادة المحاولة
          </button>
        </p>
      )}

      {state && (
        <>
          <ul className="mt-3 space-y-1.5">
            {state.counters.map((counter) => (
              <li
                key={counter.key}
                className="flex items-center justify-between gap-3 text-xs sm:text-sm"
              >
                <span className="text-muted-foreground">{counter.label}</span>
                <span className="shrink-0 font-bold text-foreground" dir="ltr">
                  {state.unlimited
                    ? 'غير محدود'
                    : `${formatCount(counter.used)} / ${formatCount(counter.cap)}`}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            {state.unlimited
              ? 'حساب مشرف: لا تنطبق عليه حدود الاستهلاك.'
              : 'التَّنزيلات لا تتجدَّد أبدًا، والعدّادات اليوميّة تعود عند منتصف اللَّيل بتوقيت دمشق.'}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold">
            <Link
              href="/account/plan"
              className="inline-flex items-center gap-1.5 text-primary hover:underline underline-offset-4"
            >
              التَّفاصيل والسِّجل
              <ArrowLeft className="size-3.5" aria-hidden="true" />
            </Link>
            {state.plan === 'free' && !state.unlimited && (
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 text-primary hover:underline underline-offset-4"
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                ترقية الخطة
              </Link>
            )}
          </div>
        </>
      )}
    </section>
  );
}
