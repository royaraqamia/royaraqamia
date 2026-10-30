'use client';

import { Lock, RotateCw } from 'lucide-react';

import { PLAN_CARD_COPY } from './plan-card-copy';

import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { useMyPlan } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';
import { formatCount, formatHijriDate } from '@/frontend/shared/format';
import type { PlanActivationMethod } from '@/shared/contracts/plans';

const PLAN_LABELS = { free: PLAN_CARD_COPY.planFree, pro: PLAN_CARD_COPY.planPro } as const;

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
      <div className="space-y-3" aria-busy="true" aria-label={PLAN_CARD_COPY.loadingLabel}>
        <div className="h-32 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-2xl card-padding border border-border/50 bg-card/60 text-center">
        <div className="flex size-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
          <Lock size={24} aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-bold text-foreground">{PLAN_CARD_COPY.signInTitle}</p>
          <p className="text-xs text-muted-foreground sm:text-sm">{PLAN_CARD_COPY.signInBody}</p>
        </div>
        <SignInCta
          href={`/auth/login?redirect=${encodeURIComponent('/account/plan')}`}
          className="mt-1 w-full sm:w-auto"
        >
          {PLAN_CARD_COPY.signIn}
        </SignInCta>
      </section>
    );
  }

  if (failed && !plan) {
    return (
      <section className="rounded-2xl card-padding border border-border/50 bg-card/60 text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          {PLAN_CARD_COPY.failed}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void reload()}>
          <RotateCw className="size-4" aria-hidden="true" />
          {PLAN_CARD_COPY.retry}
        </Button>
      </section>
    );
  }

  if (loading && !plan) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label={PLAN_CARD_COPY.loadingLabel}>
        <div className="h-32 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!plan) return null;

  const { state, limits, activations } = plan;

  /**
   * One list, counted actions first: the caps the plan enforces are stated
   * together, because a member reads "what is left" in one place rather than
   * guessing which of two lists a number belongs to (ADR-0093).
   */
  const rows = [
    ...state.counters.map((counter) => ({
      key: counter.key,
      label: counter.label,
      used: counter.used,
      cap: counter.cap,
    })),
    ...limits.map((item) => ({
      key: item.key,
      label: item.label,
      used: item.used,
      cap: item.cap,
    })),
  ];

  return (
    <div className="space-y-4">
      <section
        aria-label={PLAN_CARD_COPY.cardLabel}
        className="rounded-2xl card-padding border border-border/50 bg-card/60"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground sm:text-base">
            {PLAN_CARD_COPY.cardTitle}
          </p>
          <Badge variant={state.unlimited || state.plan === 'pro' ? 'success' : 'secondary'}>
            {state.unlimited ? PLAN_CARD_COPY.unlimited : PLAN_LABELS[state.plan]}
          </Badge>
        </div>

        <ul className="mt-3 space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-3 text-xs sm:text-sm"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="shrink-0 font-bold text-foreground" dir="ltr">
                {state.unlimited
                  ? PLAN_CARD_COPY.unlimited
                  : `${formatCount(row.used)} / ${formatCount(row.cap)}`}
              </span>
            </li>
          ))}
        </ul>

        {state.plan === 'pro' && state.expiresAt && (
          <p className="mt-2 text-xs text-muted-foreground">
            {PLAN_CARD_COPY.expires.replace('{date}', formatHijriDate(state.expiresAt))}
          </p>
        )}
      </section>

      <section aria-label="سجل الاشتراك" className="space-y-2">
        <h2 className="text-sm font-bold text-foreground sm:text-base">سجل الاشتراك</h2>

        {activations.length === 0 ? (
          <p className="rounded-2xl border border-border/50 bg-card/60 p-4 text-sm text-muted-foreground">
            لا يوجد سجل اشتراك بعد. أنت على {PLAN_CARD_COPY.planFree}، ويمكنك التَّرقية من صفحة
            الاشتراكات.
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
      </section>
    </div>
  );
}
