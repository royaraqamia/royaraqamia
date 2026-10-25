'use client';

import { useMemo } from 'react';
import type { SpendInsights } from '@/shared/contracts/spendtrack';
import { useSpendtrackContext } from '@/frontend/state/spendtrack/spendtrack-context';
import {
  categoryBreakdown,
  computeInsights,
  dailyTotals,
  type CategoryTotals,
} from '@/frontend/shared/spendtrack/local-stats';
import { CategoryPieChartLazy, DailyBarChartLazy } from '@/frontend/ui/spendtrack/charts-lazy';
import { InsightsStrip } from '@/frontend/ui/spendtrack/insights-strip';

/**
 * Local-first dashboard aggregates (ADR-0028): once the Local Store is ready
 * these recompute from IndexedDB so every figure on the page comes from one
 * source. The server-rendered `initial*` values cover SSR / first paint, before
 * the store opens — they must not disagree with the local list after hydration.
 */

function useReadyData() {
  const context = useSpendtrackContext();
  return context?.painted ? context : null;
}

export function CategoryPieChartLive({
  initialData,
  start,
  end,
  filterCategories,
  currency,
}: {
  initialData: CategoryTotals[];
  start: string;
  end: string;
  filterCategories: string[];
  currency: string;
}) {
  const context = useReadyData();
  const data = useMemo(
    () =>
      context
        ? categoryBreakdown(context.expenses, context.categories, start, end, filterCategories)
        : initialData,
    [context, initialData, start, end, filterCategories]
  );
  return <CategoryPieChartLazy data={data} currency={currency} />;
}

export function DailyBarChartLive({
  initialData,
  start,
  end,
  filterCategories,
  currency,
}: {
  initialData: { date: string; total: number }[];
  start: string;
  end: string;
  filterCategories: string[];
  currency: string;
}) {
  const context = useReadyData();
  const data = useMemo(
    () => (context ? dailyTotals(context.expenses, start, end, filterCategories) : initialData),
    [context, initialData, start, end, filterCategories]
  );
  return <DailyBarChartLazy data={data} currency={currency} />;
}

export function InsightsStripLive({
  initialInsights,
  start,
  end,
  filterCategories,
  currency,
}: {
  initialInsights: SpendInsights;
  start: string;
  end: string;
  filterCategories: string[];
  currency: string;
}) {
  const context = useReadyData();
  const insights = useMemo(
    () =>
      context
        ? computeInsights(context.expenses, context.categories, start, end, filterCategories)
        : initialInsights,
    [context, initialInsights, start, end, filterCategories]
  );
  return <InsightsStrip insights={insights} currency={currency} />;
}
