'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles, Wallet } from 'lucide-react';

import { Badge } from '@/frontend/ui/primitives/badge';
import { useMyUsage } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';

const PLAN_LABELS = { free: 'الخطَّة المجانيَّة', pro: 'الخطَّة المدفوعة' } as const;

/**
 * The member's plan at a glance. The per-item numbers moved to `/account/plan`,
 * where the whole allowance — counted actions and owned-item caps — is stated
 * together, so this card keeps only what the account row needs: which plan is
 * in force and the two ways to act on it.
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
      aria-label="اشتراكك واستهلاكك"
      className="rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5"
    >
      <header className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-sm font-bold text-foreground sm:text-base">
          <Wallet className="size-4 shrink-0 text-primary" aria-hidden="true" />
          الاشتراك والاستهلاك
        </span>
        {state ? (
          <Badge variant={state.unlimited || state.plan === 'pro' ? 'success' : 'secondary'}>
            {state.unlimited ? 'غير محدود' : PLAN_LABELS[state.plan]}
          </Badge>
        ) : (
          loading && (
            <span
              aria-busy="true"
              aria-label="جاري تحميل الاشتراك والاستهلاك"
              className="h-5 w-20 shrink-0 rounded-full bg-muted/60 animate-pulse"
            />
          )
        )}
      </header>

      {!loading && failed && !state && (
        <p className="mt-3 text-xs text-muted-foreground">
          تعذّر تحميل اشتراكك واستهلاكك.{' '}
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
              ترقية الخطَّة
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
