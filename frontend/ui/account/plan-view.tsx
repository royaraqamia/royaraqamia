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
  shamcash: PLAN_CARD_COPY.methodShamcash,
  efendim: PLAN_CARD_COPY.methodEfendim,
  other: PLAN_CARD_COPY.methodOther,
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
      <div className="roy-skeletons" aria-busy="true" aria-label={PLAN_CARD_COPY.loadingLabel}>
        <div className="roy-skeleton roy-skeleton--block-1" />
        <div className="roy-skeleton roy-skeleton--block-2" />
      </div>
    );
  }

  if (!user) {
    return (
      <section className="roy-card items-center text-center">
        <div className="roy-guest-mark">
          <Lock className="roy-glyph roy-glyph--md" aria-hidden="true" />
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
      <section className="roy-card text-center">
        <p role="alert" className="text-sm text-muted-foreground">
          {PLAN_CARD_COPY.failed}
        </p>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          <RotateCw className="roy-glyph roy-glyph--sm" aria-hidden="true" />
          {PLAN_CARD_COPY.retry}
        </Button>
      </section>
    );
  }

  if (loading && !plan) {
    return (
      <div className="roy-skeletons" aria-busy="true" aria-label={PLAN_CARD_COPY.loadingLabel}>
        <div className="roy-skeleton roy-skeleton--block-1" />
        <div className="roy-skeleton roy-skeleton--block-2" />
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
      <section aria-label={PLAN_CARD_COPY.cardLabel} className="roy-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-fluid-small font-bold text-foreground">{PLAN_CARD_COPY.cardTitle}</p>
          <Badge variant={state.unlimited || state.plan === 'pro' ? 'success' : 'secondary'}>
            {state.unlimited ? PLAN_CARD_COPY.unlimited : PLAN_LABELS[state.plan]}
          </Badge>
        </div>

        <ul className="roy-rows">
          {rows.map((row) => (
            <li key={row.key} className="roy-row">
              <span className="roy-row-label">{row.label}</span>
              <span className="roy-row-value">
                {state.unlimited
                  ? PLAN_CARD_COPY.unlimited
                  : `${formatCount(row.used)} / ${formatCount(row.cap)}`}
              </span>
            </li>
          ))}
        </ul>

        {state.plan === 'pro' && state.expiresAt && (
          <p className="text-fluid-xs text-muted-foreground">
            {PLAN_CARD_COPY.expires.replace('{date}', formatHijriDate(state.expiresAt))}
          </p>
        )}
      </section>

      <section aria-label={PLAN_CARD_COPY.historyTitle} className="space-y-2">
        <h2 className="text-sm font-bold text-foreground sm:text-base">
          {PLAN_CARD_COPY.historyTitle}
        </h2>

        {activations.length === 0 ? (
          <p className="rounded-2xl border border-border/50 bg-card/60 p-4 text-sm text-muted-foreground">
            {PLAN_CARD_COPY.historyEmpty.replace('{plan}', PLAN_CARD_COPY.planFree)}
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
                  {PLAN_CARD_COPY.activatedLine
                    .replace('{activated}', formatHijriDate(activation.activatedAt))
                    .replace('{expires}', formatHijriDate(activation.expiresAt))}
                </p>
                {activation.note && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {PLAN_CARD_COPY.noteLine.replace('{note}', activation.note)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
