'use client';

import { Lock, RotateCw } from 'lucide-react';

import { PLAN_CARD_COPY } from './plan-card-copy';

import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { usePlanPage } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';
import { formatCount, formatHijriDate } from '@/frontend/shared/format';
import type {
  OwnedItemState,
  PlanActivationMethod,
  UsageCounterState,
  UsageState,
} from '@/shared/contracts/plans';

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

/** One key's standing allowance, as the card draws it. */
export interface StandingMeter {
  key: string;
  label: string;
  used: number;
  cap: number;
  /** [used] as a whole percentage of [cap], capped at 100. */
  share: number;
}

/**
 * One meter per owned key the account actually holds something in.
 *
 * The caps are thirteen unrelated keys, and their sum is a number no member can
 * act on: the fullest plain account in production holds two rows, which reads as
 * 3% of a 65-slot total and argues against the next tier instead of describing
 * this account (#1951). A key with no rows draws no meter, because a member who
 * holds nothing in it is not using it; a key with a cap of zero is an Admin's
 * unlimited placeholder and has no division to draw.
 *
 * The sorted order puts the key closest to its wall first, which is the one the
 * member is about to meet. A daily count is not a slot and stays in
 * `dailyCounters`; the app's `UsageScreenModel` derives the same meters from the
 * same `limits` body, so both clients draw the same rows (ADR-0098).
 */
export function standingMeters(limits: OwnedItemState[]): StandingMeter[] {
  return limits
    .filter((item) => item.used > 0 && item.cap > 0)
    .map((item) => ({
      key: item.key,
      label: item.label,
      used: item.used,
      cap: item.cap,
      share: Math.min(100, Math.round((item.used / item.cap) * 100)),
    }))
    .sort((a, b) => b.share - a.share || b.used - a.used || a.key.localeCompare(b.key));
}

/**
 * The counted actions that reset daily, closest to their cap first. The body
 * names them — no key is listed here — so a cap added to `usage_limits` reaches
 * the page without a second change. Four lines are enough to say where the day
 * stands; a cap of zero is an Admin's unlimited placeholder, not a meter.
 */
export function dailyCounters(counters: UsageCounterState[], limit = 4): UsageCounterState[] {
  return counters
    .filter((counter) => counter.window === 'daily' && counter.cap > 0)
    .sort(
      (a, b) => b.used / b.cap - a.used / a.cap || b.used - a.used || a.key.localeCompare(b.key)
    )
    .slice(0, limit);
}

/**
 * The empty history is a sentence about the plan in force, not about the
 * missing rows. A comped or unlimited member has no payment to show, but
 * naming the free plan would be a false statement about what they hold — so
 * each state reads its own key and no plan is described by another's words.
 */
function emptyHistoryCopy(state: UsageState): string {
  if (state.plan !== 'pro' && !state.unlimited) {
    return PLAN_CARD_COPY.historyEmpty.replace('{plan}', PLAN_CARD_COPY.planFree);
  }
  if (state.expiresAt) {
    return PLAN_CARD_COPY.historyEmptyActive.replace('{date}', formatHijriDate(state.expiresAt));
  }
  // An Admin holds no plan row, so there is no expiry to name. Never fall
  // through to the free sentence here: that is the claim this state rejects.
  return PLAN_CARD_COPY.historyEmptyUnlimited;
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
  const { plan, loading, failed, reload, usage } = usePlanPage(Boolean(user));

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
   * One meter per key the account holds. The page used to sum all thirteen caps
   * into a single share, which read as "how full my plan is" while a real member
   * holds two rows and the paid ceiling is forty times the free one — a number
   * that described no decision the member was making (#1951). The heading names
   * the axis the paid tier changes, in the same words the server's cap refusal
   * answers with.
   *
   * The bar is a div with a `transform` rather than a `<progress>`: the app fills
   * the same track with `fillMaxWidth(fraction)`, and a recipe only both clients
   * can draw is the point (ADR-0099).
   */
  const meters = standingMeters(limits);
  const today = dailyCounters(usage?.counters ?? []);

  return (
    <div className="space-y-4">
      <section aria-label={PLAN_CARD_COPY.cardLabel} className="roy-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-fluid-small font-bold text-foreground">{PLAN_CARD_COPY.cardTitle}</p>
          <Badge variant={state.unlimited || state.plan === 'pro' ? 'success' : 'secondary'}>
            {state.unlimited ? PLAN_CARD_COPY.unlimited : PLAN_LABELS[state.plan]}
          </Badge>
        </div>

        {today.length > 0 && (
          <section
            data-visual="plan-today"
            aria-label={PLAN_CARD_COPY.todayTitle}
            className="space-y-1"
          >
            <h2 className="text-fluid-small font-bold text-foreground">
              {PLAN_CARD_COPY.todayTitle}
            </h2>
            <ul className="space-y-1">
              {today.map((counter) => (
                <li
                  key={counter.key}
                  data-visual="plan-today-row"
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-fluid-xs text-muted-foreground">{counter.label}</span>
                  <span className="roy-row-value">
                    {formatCount(counter.used)} / {formatCount(counter.cap)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-fluid-xs text-muted-foreground">{PLAN_CARD_COPY.dailyReset}</p>
          </section>
        )}

        {state.unlimited ? (
          <p className="text-fluid-small font-bold text-foreground">{PLAN_CARD_COPY.unlimited}</p>
        ) : meters.length > 0 ? (
          <section
            data-visual="plan-standing"
            aria-label={PLAN_CARD_COPY.capAxis}
            className="space-y-2"
          >
            <p data-visual="plan-standing-label" className="text-fluid-xs text-muted-foreground">
              {PLAN_CARD_COPY.capAxis}
            </p>
            <ul className="space-y-2">
              {meters.map((meter) => (
                <li key={meter.key} data-visual="plan-standing-row" className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-fluid-xs text-muted-foreground">{meter.label}</span>
                    <span className="roy-row-value">
                      {formatCount(meter.used)} / {formatCount(meter.cap)}
                    </span>
                  </div>
                  <div className="roy-progress">
                    <div
                      role="progressbar"
                      aria-label={meter.label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={meter.share}
                      className="roy-progress-track"
                    >
                      <div
                        className="roy-progress-fill"
                        style={{ transform: `scaleX(${meter.share / 100})` }}
                        aria-hidden="true"
                      />
                    </div>
                    <span className="roy-progress-value">{formatCount(meter.share)}%</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
            {emptyHistoryCopy(state)}
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
