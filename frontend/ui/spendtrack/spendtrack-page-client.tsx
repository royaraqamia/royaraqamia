'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { endOfMonth, format, startOfMonth, subDays } from 'date-fns';
import { DEFAULT_CURRENCY } from '@/shared/currency';
import { useSession } from '@/frontend/state/session-provider';
import { SpendtrackProvider } from '@/frontend/state/spendtrack/spendtrack-context';
import type { SpendtrackSeed } from '@/frontend/state/spendtrack/use-spendtrack';
import { getCurrency, getDefaultCategories } from '@/frontend/api/spendtrack';
import { SpendtrackDashboard } from '@/frontend/ui/spendtrack/spendtrack-dashboard';

/**
 * SpendTrack's dashboard as a cached shell (#449, ADR-0073).
 *
 * The page itself is static: it renders no account state and reads no
 * `searchParams` on the server. This component resolves the session on the
 * client, seeds the identity's Local Store (the guest's default categories come
 * through a never-cache read, since the RSC loader that used to supply them is
 * gone from this path), and lets the store paint the dashboard. Filter state
 * still lives in the URL — it is view state, not a server render input.
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
    <div className="space-y-4" aria-busy="true" aria-label="جاري فتح التَّخزين المحلِّي">
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
  const { user, isLoading } = useSession();
  const [seed, setSeed] = useState<SpendtrackSeed | null>(null);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;

    if (!user) {
      // The guest store starts with the shared defaults the server used to
      // seed it with; offline this read fails quietly and the guest starts
      // empty rather than blocked.
      void getDefaultCategories().then((categories) => {
        if (cancelled) return;
        setSeed({ categories, expenses: [], budgets: [], recurring: [], user: null });
      });
      return () => {
        cancelled = true;
      };
    }

    setSeed({ categories: [], expenses: [], budgets: [], recurring: [], user: { id: user.id } });
    return () => {
      cancelled = true;
    };
  }, [isLoading, user]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
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
  }, [isLoading, user]);

  const range = searchParams.get('range') || 'this_month';
  const filterCategories = (searchParams.get('categories') ?? '').split(',').filter(Boolean);
  const sort = searchParams.get('sort') || 'date_desc';
  const search = searchParams.get('search')?.trim() || undefined;
  const { start, end } = getDateRange(
    range,
    searchParams.get('from') ?? undefined,
    searchParams.get('to') ?? undefined
  );

  if (!seed) return <DashboardSkeleton />;

  return (
    <SpendtrackProvider seed={seed}>
      <SpendtrackDashboard
        currency={currency}
        start={start}
        end={end}
        filterCategories={filterCategories}
        sort={sort}
        search={search}
        isSignedIn={Boolean(user)}
        autoOpen={searchParams.get('create') === '1'}
        onCurrencyChange={setCurrency}
      />
    </SpendtrackProvider>
  );
}
