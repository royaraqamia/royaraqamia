'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles, Wallet } from 'lucide-react';

import { Badge } from '@/frontend/ui/primitives/badge';
import { useMyUsage } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';
import { formatCount } from '@/frontend/shared/format';

const PLAN_LABELS = { free: 'الخطة المجانيَّة', pro: 'الخطة المدفوعة' } as const;

function usagePercent(spent: number, cap: number): number {
  if (cap <= 0) return 100;
  return Math.min(100, Math.round((spent / cap) * 100));
}

/**
 * The member's allowance at a glance: one number, because the credit pool is
 * the one allowance that changes as they work. Owned-item caps are deliberately
 * absent — they bind at the moment something is created, not here (ADR-0075).
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
          <div className="h-7 w-32 rounded-lg bg-muted/60 animate-pulse" />
          <div className="h-1.5 w-full rounded-full bg-muted/60 animate-pulse" />
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
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <p className="flex items-baseline gap-1.5" dir="ltr">
              <span className="text-2xl font-black tracking-tight text-foreground">
                {state.unlimited ? 'غير محدود' : formatCount(state.remaining)}
              </span>
              {!state.unlimited && (
                <span className="text-sm text-muted-foreground">/ {formatCount(state.cap)}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">متبقٍّ لك</p>
          </div>

          {!state.unlimited && (
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`استُهلك ${usagePercent(state.spent, state.cap)} بالمئة من الرصيد`}
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${usagePercent(state.spent, state.cap)}%` }}
              />
            </div>
          )}

          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            {state.unlimited
              ? 'حساب مشرف: لا ينطبق عليه حدُّ الاستهلاك.'
              : `رصيد يتجدَّد تدريجيًّا خلال ${state.windowDays} يوماً، ويُستهلك عند النَّشر والإنشاء والتَّنزيل.`}
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
