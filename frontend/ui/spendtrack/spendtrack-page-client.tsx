'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { endOfMonth, format, startOfMonth, subDays } from 'date-fns';
import { DEFAULT_CURRENCY } from '@/shared/currency';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { identityUserId } from '@/frontend/shared/local-store/identity';
import { SpendtrackProvider } from '@/frontend/state/spendtrack/spendtrack-context';
import type { SpendtrackSeed } from '@/frontend/state/spendtrack/use-spendtrack';
import type { Category } from '@/shared/contracts/spendtrack';
import { getCurrency, getDefaultCategories } from '@/frontend/api/spendtrack';
import { SpendtrackDashboard } from '@/frontend/ui/spendtrack/spendtrack-dashboard';

/**
 * SpendTrack's dashboard as a cached shell (#449, ADR-0073).
 *
 * The page itself is static: it renders no account state and reads no
 * `searchParams` on the server. This component resolves the identity (#493) and
 * hands the provider that identity's Local Store, which paints the dashboard.
 * Filter state still lives in the URL — it is view state, not a server render
 * input.
 *
 * The guest's default categories are the one thing a Local Store cannot answer
 * on a device that has never seen one, and they are **not** a paint gate: the
 * shell mounts with an empty category list and the defaults arrive as a
 * background `seedIfEmpty` input (`use-spendtrack`), so the first frame is the
 * store's own rows rather than a fetch.
 */

function getDateRange(range: string, from?: string, to?: string) {
  const now = new Date();
  switch (range) {
    case 'last_7':
      return { start: format(subDays(now, 6), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    case 'last_30':
      return { start: format(subDays(now, 29), 'yyyy-MM-dd'), end: format(now, 'yyyy-MM-dd') };
    case 'all':
      return { start: from || '1900-01-01', end: to || '2099-12-31' };
    default:
      return {
        start: format(startOfMonth(now), 'yyyy-MM-dd'),
        end: format(endOfMonth(now), 'yyyy-MM-dd'),
      };
  }
}

function DashboardSkeleton() {
  return (
    <div
      className="space-y-4"
      data-local-store-skeleton="true"
      aria-busy="true"
      aria-label="جاري فتح التَّخزين المحلِّي"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-44 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
        <div className="h-44 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
      </div>
      <div className="h-28 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
      <div className="h-40 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
      <div className="h-72 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
    </div>
  );
}

export function SpendtrackPageClient() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SpendtrackPageContent />
    </Suspense>
  );
}

function SpendtrackPageContent() {
  const searchParams = useSearchParams();
  const { identity, sessionUserId, isLoading } = useLocalIdentity();
  const userId = identityUserId(identity);
  const [defaultCategories, setDefaultCategories] = useState<readonly Category[]>([]);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  // The guest's default categories, fetched behind the first paint: a store
  // that already holds rows never needs them (`seedIfEmpty` is a one-shot), and
  // an offline device simply never gets this far.
  useEffect(() => {
    if (isLoading || sessionUserId) return;
    let cancelled = false;
    void getDefaultCategories()
      .then((categories) => {
        if (!cancelled) setDefaultCategories(categories);
      })
      .catch(() => {
        // A cold offline guest starts with no categories rather than blocked.
      });
    return () => {
      cancelled = true;
    };
  }, [isLoading, sessionUserId]);

  // The seed is derived from the identity, never from the session: it is the
  // input the store opens with, so waiting for `getSession()` here would put the
  // skeleton back (#493).
  const seed: SpendtrackSeed = useMemo(
    () => ({
      categories: defaultCategories,
      expenses: [],
      budgets: [],
      recurring: [],
      user: userId ? { id: userId } : null,
    }),
    [defaultCategories, userId]
  );

  useEffect(() => {
    if (isLoading) return;
    if (!sessionUserId) {
      setCurrency(DEFAULT_CURRENCY);
      return;
    }
    let cancelled = false;
    void getCurrency().then((next) => {
      if (!cancelled && next) setCurrency(next);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoading, sessionUserId]);

  const range = searchParams.get('range') || 'this_month';
  const filterCategories = (searchParams.get('categories') ?? '').split(',').filter(Boolean);
  const sort = searchParams.get('sort') || 'date_desc';
  const search = searchParams.get('search')?.trim() || undefined;
  const { start, end } = getDateRange(
    range,
    searchParams.get('from') ?? undefined,
    searchParams.get('to') ?? undefined
  );

  return (
    <SpendtrackProvider seed={seed}>
      <SpendtrackDashboard
        currency={currency}
        start={start}
        end={end}
        filterCategories={filterCategories}
        sort={sort}
        search={search}
        isSignedIn={Boolean(userId)}
        autoOpen={searchParams.get('create') === '1'}
        onCurrencyChange={setCurrency}
      />
    </SpendtrackProvider>
  );
}
