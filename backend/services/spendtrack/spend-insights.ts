import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import type { SpendInsights } from '@/shared/contracts/spendtrack';

export type CategoryTotals = {
  categoryId: string;
  colorHex: string;
  name: string;
  total: number;
};

export interface InsightInputs {
  total: number;
  breakdown: CategoryTotals[];
  start: string;
  end: string;
  prevPeriodTotal: number | null;
}

export function previousPeriodRange(
  start: string,
  end: string
): {
  start: string;
  end: string;
} {
  const startDate = parseISO(start);
  const spanDays = differenceInCalendarDays(parseISO(end), startDate);
  return {
    end: format(subDays(startDate, 1), 'yyyy-MM-dd'),
    start: format(subDays(startDate, spanDays + 1), 'yyyy-MM-dd'),
  };
}

export function calculateInsights({
  total,
  breakdown,
  start,
  end,
  prevPeriodTotal,
}: InsightInputs): SpendInsights {
  const days = Math.max(1, differenceInCalendarDays(parseISO(end), parseISO(start)) + 1);
  const avgPerDay = total / days;

  const sorted = [...breakdown].sort((a, b) => b.total - a.total);
  const top = sorted[0] ?? null;

  let topCategory: SpendInsights['topCategory'] = null;
  let topCategoryShare = 0;
  if (top && total > 0) {
    topCategory = { name: top.name, colorHex: top.colorHex, total: top.total };
    topCategoryShare = top.total / total;
  }

  let deltaPct: number | null = null;
  if (prevPeriodTotal !== null && prevPeriodTotal > 0) {
    deltaPct = (total - prevPeriodTotal) / prevPeriodTotal;
  }

  return { topCategory, topCategoryShare, avgPerDay, prevPeriodTotal, deltaPct };
}
