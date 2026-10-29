'use client';

import { Lock, RotateCw } from 'lucide-react';

import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { useMyPlan } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';
import { formatCount, formatHijriDate } from '@/frontend/shared/format';
import type { PlanActivationMethod } from '@/shared/contracts/plans';

const PLAN_LABELS = { free: 'الخطة المجانيَّة', pro: 'الخطة المدفوعة' } as const;

const METHOD_LABELS: Record<PlanActivationMethod, string> = {
  shamcash: 'ShamCash',
  efendim: 'Efendim Pay',
  other: 'أخرى',
};

function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${formatted}` : `${formatted} ${currency}`;
}

/**
 * The member's plan and every activation behind it. The view owns the guard
 * (as the other `/account` children do), so the document is a data-free shell
 * and a guest is pointed at sign-in rather than at an empty history.
 */
export function PlanView() {
  const { user, isLoading: sessionLoading } = useSession();
  const { plan, loading, failed, reload } = useMyPlan(Boolean(user));

  if (sessionLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل الاشتراك">
        <div className="h-32 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
          <Lock size={24} aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-bold text-foreground">سجِّل الدُّخول لعرض اشتراكك</p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            استهلاكك وسجلّ التفعيل يتبعان حسابك.
          </p>
        </div>
        <SignInCta
          href={`/auth/login?redirect=${encodeURIComponent('/account/plan')}`}
          className="mt-1 w-full sm:w-auto"
        />
      </section>
    );
  }

  if (failed && !plan) {
    return (
      <section className="rounded-2xl border border-border/50 bg-card/60 p-5 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          تعذّر تحميل بيانات اشتراكك.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void reload()}>
          <RotateCw className="size-4" aria-hidden="true" />
          إعادة المحاولة
        </Button>
      </section>
    );
  }

  if (loading && !plan) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل الاشتراك">
        <div className="h-32 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!plan) return null;

  const { state, activations } = plan;

  return (
    <div className="space-y-4">
      <section
        aria-label="خطتك الحالية"
        className="rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground sm:text-base">خطتك الحالية</p>
          <Badge variant={state.unlimited || state.plan === 'pro' ? 'success' : 'secondary'}>
            {state.unlimited ? 'غير محدود' : PLAN_LABELS[state.plan]}
          </Badge>
        </div>

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
            : 'التَّنزيلات حدٌّ دائم لا يتجدَّد، والعدّادات اليوميّة تعود عند منتصف اللَّيل بتوقيت دمشق.'}
        </p>

        {state.plan === 'pro' && state.expiresAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            تنتهي الخطة في {formatHijriDate(state.expiresAt)}، ثم تعود إلى الخطة المجانيَّة بحدودها.
          </p>
        )}
      </section>

      <section aria-label="سجل التفعيل" className="space-y-2">
        <h2 className="text-sm font-bold text-foreground sm:text-base">سجل التَّفعيل</h2>

        {activations.length === 0 ? (
          <p className="rounded-2xl border border-border/50 bg-card/60 p-4 text-sm text-muted-foreground">
            لا يوجد سجل تفعيل بعد. أنت على الخطة المجانيَّة، ويمكنك الترقية من صفحة الاشتراكات.
          </p>
        ) : (
          <ul className="space-y-2">
            {activations.map((activation) => (
              <li
                key={activation.id}
                className="rounded-2xl border border-border/50 bg-card/60 p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-foreground">
                    {formatMoney(activation.amountCents, activation.currency)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {METHOD_LABELS[activation.method]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  فُعِّلت في {formatHijriDate(activation.activatedAt)}، وتنتهي في{' '}
                  {formatHijriDate(activation.expiresAt)}.
                </p>
                {activation.note && (
                  <p className="mt-1 text-xs text-muted-foreground">«{activation.note}»</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">
          التَّفعيل يدويّ بعد تأكيد الدَّفعة، ولا يوجد تجديد تلقائي: تنتهي الخطة وحدها بعد 30 يوماً.
        </p>
      </section>
    </div>
  );
}
