'use client';

import { useMemo } from 'react';
import { Download, PieChartIcon, Receipt, TrendingUp } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { Button } from '@/frontend/ui/primitives/button';
import { useSpendtrackContext } from '@/frontend/state/spendtrack/spendtrack-context';
import { CreateExpenseDialog } from '@/frontend/ui/spendtrack/expense-dialog';
import { BudgetCard } from '@/frontend/ui/spendtrack/budget-card';
import { CategoryBudgets } from '@/frontend/ui/spendtrack/category-budgets';
import { RecurringExpenses } from '@/frontend/ui/spendtrack/recurring-expenses';
import { ExpenseList } from '@/frontend/ui/spendtrack/expense-list';
import { TransactionFilters } from '@/frontend/ui/spendtrack/transaction-filters';
import { InsightsStrip } from '@/frontend/ui/spendtrack/insights-strip';
import { CategoryPieChartLazy, DailyBarChartLazy } from '@/frontend/ui/spendtrack/charts-lazy';
import { SpendtrackSyncStatus } from '@/frontend/ui/spendtrack/spendtrack-sync-status';
import { TotalSpendCard } from '@/frontend/ui/spendtrack/total-spend-card';
import { SignInPrompt } from '@/frontend/ui/shared/sign-in-prompt';
import {
  categoryBreakdown,
  computeInsights,
  dailyTotals,
  totalExpenses,
} from '@/frontend/shared/spendtrack/local-stats';

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`w-full animate-pulse rounded-2xl bg-muted/40 ${className}`}
    />
  );
}

export function SpendtrackDashboard({
  currency,
  start,
  end,
  filterCategories,
  sort,
  search,
}: {
  currency: string;
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
  search?: string;
}) {
  const context = useSpendtrackContext();
  const ready = context?.ready ?? false;
  const categories = useMemo(() => context?.categories ?? [], [context?.categories]);
  const expenses = useMemo(() => context?.expenses ?? [], [context?.expenses]);

  const total = useMemo(
    () => totalExpenses(expenses, start, end, filterCategories),
    [expenses, start, end, filterCategories]
  );
  const breakdown = useMemo(
    () => categoryBreakdown(expenses, categories, start, end, filterCategories),
    [expenses, categories, start, end, filterCategories]
  );
  const daily = useMemo(
    () => dailyTotals(expenses, start, end, filterCategories),
    [expenses, start, end, filterCategories]
  );
  const insights = useMemo(
    () => computeInsights(expenses, categories, start, end, filterCategories),
    [expenses, categories, start, end, filterCategories]
  );

  const month = format(new Date(), 'yyyy-MM');
  const monthTotal = useMemo(
    () =>
      totalExpenses(
        expenses,
        format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        []
      ),
    [expenses]
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <CreateExpenseDialog categories={categories} currency={currency} />
          <SignInPrompt
            title="تصدير واستيراد CSV"
            description="حفظ بياناتك في ملف أو استيراد ملفٍّ سابق يحتاج إلى حساب. سجِّل الدُّخول للاستمرار."
          >
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="h-9 px-3 gap-1.5 text-xs font-medium rounded-xl border-border/80 hover:bg-accent active:scale-95 transition-safe"
            >
              <Download className="size-3.5" />
              تصدير CSV
            </Button>
          </SignInPrompt>
        </div>
        <SpendtrackSyncStatus />
      </div>

      {!ready ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44" />
            <Skeleton className="h-44" />
          </div>
          <Skeleton className="h-40" />
          <Skeleton className="h-28" />
          <Skeleton className="h-40" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <TotalSpendCard total={total} start={start} end={end} currency={currency} />
            <BudgetCard month={month} total={monthTotal} currency={currency} />
          </div>

          <CategoryBudgets month={month} initialBudgets={[]} />

          <InsightsStrip insights={insights} currency={currency} />

          <RecurringExpenses categories={categories} initialRecurring={[]} currency={currency} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              className="group/card card-lift"
              aria-label="رسم بياني يوضح توزيع الإنفاق حسب التصنيف"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">حسب التصنيف</CardTitle>
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover/card:bg-primary/15">
                  <PieChartIcon className="size-3.5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <CategoryPieChartLazy data={breakdown} currency={currency} />
              </CardContent>
            </Card>
            <Card
              className="group/card card-lift"
              aria-label="رسم بياني يوضح الاتجاهات اليومية للإنفاق"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">الاتجاهات اليومية</CardTitle>
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover/card:bg-primary/15">
                  <TrendingUp className="size-3.5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <DailyBarChartLazy data={daily} currency={currency} />
              </CardContent>
            </Card>
          </div>

          <Card className="group/card card-lift">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">المعاملات</CardTitle>
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                <Receipt className="size-3.5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <TransactionFilters categories={categories} />
              <ExpenseList
                expenses={[]}
                categories={categories}
                totalCount={0}
                start={start}
                end={end}
                filterCategories={filterCategories}
                sort={sort}
                search={search}
                currency={currency}
              />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
