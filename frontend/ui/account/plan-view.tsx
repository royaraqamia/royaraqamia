'use client';

import { Lock, RotateCw } from 'lucide-react';

import { PLAN_CARD_COPY } from './plan-card-copy';

import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { useMyPlan } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';
import { formatCount, formatHijriDate } from '@/frontend/shared/format';
import type { OwnedItemState, PlanActivationMethod } from '@/shared/contracts/plans';

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
 * The share of the plan's standing allowance the account has filled, as a whole
 * percentage.
 *
 * The page counts the owned-item caps and nothing else: a counted action
 * (download, scan, surah, assistant question) is a number of times that resets,
 * and folding a daily count into a standing one would make the bar drop back at
 * midnight without the member having given anything up. The app's
 * `UsageScreenModel` derives the same number from the same `limits` body, so the
 * two clients draw one bar (ADR-0098).
 *
 * Every cap is a standing limit with a row per slot, so the sum of the caps is a
 * number a member can read as "how full my plan is" — and a plan with no caps
 * reads as empty rather than as a division by zero.
 */
export function usageShare(limits: OwnedItemState[]): number {
  const cap = limits.reduce((total, item) => total + item.cap, 0);
  if (cap <= 0) return 0;
  const used = limits.reduce((total, item) => total + item.used, 0);
  return Math.min(100, Math.round((used / cap) * 100));
}

/**
 * The page: its title, then the member's plan or the state that stands in for it.
 * The heading lives here rather than in `page.tsx` so the app's screen can draw
 * the same sentence from the same generated copy (ADR-0098), and the route stays
 * a data-free shell (#448).
 */
export function PlanView() {
  return (
    <div className="space-y-6">
      <header data-visual="plan-title" className="mb-10 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{PLAN_CARD_COPY.pageTitle}</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <PlanBody />
    </div>
  );
}

/**
 * The member's plan and every activation behind it. The view owns the guard
 * (as the other `/account` children do), so the document is a data-free shell
 * and a guest is pointed at sign-in rather than at an empty history.
 */
function PlanBody() {
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
      <section data-visual="plan-card" className="roy-card items-center text-center">
        <div data-visual="plan-mark" className="roy-guest-mark">
          <Lock className="roy-glyph roy-glyph--md" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p data-visual="plan-sign-in-title" className="text-base font-bold text-foreground">
            {PLAN_CARD_COPY.signInTitle}
          </p>
          <p data-visual="plan-sign-in-body" className="text-xs text-muted-foreground sm:text-sm">
            {PLAN_CARD_COPY.signInBody}
          </p>
        </div>
        <SignInCta
          href={`/auth/login?redirect=${encodeURIComponent('/account/plan')}`}
          className="mt-1 w-full sm:w-auto"
          visual="plan-cta"
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
   * One bar for the whole allowance. The page used to print one row per item and
   * per counted action; a member had to read nineteen numbers to learn one thing —
   * how much of the plan is in use — so the standing caps are summed into one
   * share, and the plan page stops being a table.
   *
   * The bar is a div with a `transform` rather than a `<progress>`: the app fills
   * the same track with `fillMaxWidth(fraction)`, and a recipe only both clients
   * can draw is the point (ADR-0099).
   */
  const share = usageShare(limits);

  return (
    <div className="space-y-4">
      <section aria-label={PLAN_CARD_COPY.cardLabel} className="roy-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-fluid-small font-bold text-foreground">{PLAN_CARD_COPY.cardTitle}</p>
          <Badge variant={state.unlimited || state.plan === 'pro' ? 'success' : 'secondary'}>
            {state.unlimited ? PLAN_CARD_COPY.unlimited : PLAN_LABELS[state.plan]}
          </Badge>
        </div>

        {state.unlimited ? (
          <p className="text-fluid-small font-bold text-foreground">{PLAN_CARD_COPY.unlimited}</p>
        ) : (
          <div className="roy-progress">
            <div
              role="progressbar"
              aria-label={PLAN_CARD_COPY.usageLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={share}
              className="roy-progress-track"
            >
              <div
                className="roy-progress-fill"
                style={{ transform: `scaleX(${share / 100})` }}
                aria-hidden="true"
              />
            </div>
            <span className="roy-progress-value">{formatCount(share)}%</span>
          </div>
        )}

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
