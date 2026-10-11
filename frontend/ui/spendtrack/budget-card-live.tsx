'use client';

import { useMemo } from 'react';
import { useSpendtrackContext } from '@/frontend/state/spendtrack/spendtrack-context';
import { totalExpenses } from '@/frontend/shared/spendtrack/local-stats';
import { BudgetCard } from '@/frontend/ui/spendtrack/budget-card';

/**
 * Budget card with a local-first "spent this month" total (ADR-0028), so the
 * progress it shows agrees with the local-first transaction list. `initialTotal`
 * is the server value used until the store is ready (and for SSR/first paint).
 */
export function BudgetCardLive({
  month,
  start,
  end,
  initialTotal,
  currency,
}: {
  month: string;
  start: string;
  end: string;
  initialTotal: number;
  currency: string;
}) {
  const context = useSpendtrackContext();

  const total = useMemo(() => {
    if (!context?.ready) return initialTotal;
    return totalExpenses(context.expenses, start, end, []);
  }, [context?.ready, context?.expenses, initialTotal, start, end]);

  return <BudgetCard month={month} total={total} currency={currency} />;
}
