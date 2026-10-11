'use client';

import { useMemo } from 'react';
import { useSpendtrackContext } from '@/frontend/state/spendtrack/spendtrack-context';
import { totalExpenses } from '@/frontend/shared/spendtrack/local-stats';
import { TotalSpendCard } from '@/frontend/ui/spendtrack/total-spend-card';

/**
 * Local-first total (ADR-0028): the signed-in dashboard's transactions list
 * already renders from the Local Store, so the total must too — otherwise a
 * server-rendered total can disagree with a local list during any divergence.
 * `initialTotal` is the server value used until the store is ready (and for
 * SSR/first paint).
 */
export function TotalSpendCardLive({
  initialTotal,
  start,
  end,
  filterCategories,
  currency,
}: {
  initialTotal: number;
  start: string;
  end: string;
  filterCategories: string[];
  currency: string;
}) {
  const context = useSpendtrackContext();

  const total = useMemo(() => {
    if (!context?.ready) return initialTotal;
    return totalExpenses(context.expenses, start, end, filterCategories);
  }, [context?.ready, context?.expenses, initialTotal, start, end, filterCategories]);

  return <TotalSpendCard total={total} start={start} end={end} currency={currency} />;
}
