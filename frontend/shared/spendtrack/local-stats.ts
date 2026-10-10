import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import type { Category, Expense, SpendInsights } from '@/shared/contracts/spendtrack';

export interface CategoryTotals {
  categoryId: string;
  colorHex: string;
  name: string;
  total: number;
}

function inRange(expense: Expense, start: string, end: string): boolean {
  return expense.date >= start && expense.date <= end;
}

function matchesCategories(expense: Expense, filter: string[]): boolean {
  return filter.length === 0 || filter.includes(expense.category_id);
}

export function totalExpenses(
  expenses: readonly Expense[],
  start: string,
  end: string,
  filterCategories: string[]
): number {
  return expenses
    .filter(
      (expense) => inRange(expense, start, end) && matchesCategories(expense, filterCategories)
    )
    .reduce((sum, expense) => sum + expense.amount, 0);
}

export function dailyTotals(
  expenses: readonly Expense[],
  start: string,
  end: string,
  filterCategories: string[]
): { date: string; total: number }[] {
  const byDate = new Map<string, number>();
  for (const expense of expenses) {
    if (!inRange(expense, start, end) || !matchesCategories(expense, filterCategories)) continue;
    byDate.set(expense.date, (byDate.get(expense.date) ?? 0) + expense.amount);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));
}

export function categoryBreakdown(
  expenses: readonly Expense[],
  categories: readonly Category[],
  start: string,
  end: string,
  filterCategories: string[]
): CategoryTotals[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (!inRange(expense, start, end)) continue;
    const allocations =
      expense.splits && expense.splits.length > 0
        ? expense.splits.map((split) => ({
            category_id: split.category_id,
            amount: split.amount,
          }))
        : [{ category_id: expense.category_id, amount: expense.amount }];
    for (const allocation of allocations) {
      if (filterCategories.length > 0 && !filterCategories.includes(allocation.category_id))
        continue;
      totals.set(
        allocation.category_id,
        (totals.get(allocation.category_id) ?? 0) + allocation.amount
      );
    }
  }
  return [...totals.entries()]
    .filter(([, total]) => total > 0)
    .map(([categoryId, total]) => {
      const category = byId.get(categoryId);
      return {
        categoryId,
        colorHex: category?.colorHex ?? '#8f6fe5',
        name: category?.name ?? '—',
        total,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function previousPeriodRange(start: string, end: string): { start: string; end: string } {
  const startDate = parseISO(start);
  const spanDays = differenceInCalendarDays(parseISO(end), startDate);
  return {
    end: format(subDays(startDate, 1), 'yyyy-MM-dd'),
    start: format(subDays(startDate, spanDays + 1), 'yyyy-MM-dd'),
  };
}

export function computeInsights(
  expenses: readonly Expense[],
  categories: readonly Category[],
  start: string,
  end: string,
  filterCategories: string[]
): SpendInsights {
  const total = totalExpenses(expenses, start, end, filterCategories);
  const breakdown = categoryBreakdown(expenses, categories, start, end, filterCategories);
  const prev = previousPeriodRange(start, end);
  const prevPeriodTotal = totalExpenses(expenses, prev.start, prev.end, filterCategories);

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
  if (prevPeriodTotal > 0) {
    deltaPct = (total - prevPeriodTotal) / prevPeriodTotal;
  }

  return { topCategory, topCategoryShare, avgPerDay, prevPeriodTotal, deltaPct };
}
