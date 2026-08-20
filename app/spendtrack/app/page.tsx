import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { DollarSign, PieChartIcon, TrendingUp, Receipt } from 'lucide-react';
import { CreateExpenseDialog } from '@/frontend/ui/spendtrack/expense-dialog';
import { BudgetCard } from '@/frontend/ui/spendtrack/budget-card';
import { CategoryBudgets } from '@/frontend/ui/spendtrack/category-budgets';
import { RecurringExpenses } from '@/frontend/ui/spendtrack/recurring-expenses';
import { ExpenseList } from '@/frontend/ui/spendtrack/expense-list';
import { CategoryPieChartLazy } from '@/frontend/ui/spendtrack/charts-lazy';
import { DailyBarChartLazy } from '@/frontend/ui/spendtrack/charts-lazy';
import { ChartsSkeleton } from '@/frontend/ui/spendtrack/charts-skeleton';
import { InsightsStrip } from '@/frontend/ui/spendtrack/insights-strip';
import { CsvActions } from '@/frontend/ui/spendtrack/csv-actions';
import { TransactionFilters } from '@/frontend/ui/spendtrack/transaction-filters';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import {
  loadCategoryBreakdown,
  loadCategoryBudgets,
  loadDailyTotals,
  loadInsights,
  loadRecurringExpenses,
  loadTotalExpenses,
  loadTransactions,
  loadUserCategories,
  loadUserCurrency,
} from '@/backend/loaders/spendtrack';
import { formatMoney } from '@/shared/currency';
import { CurrencySelector } from '@/frontend/ui/spendtrack/currency-selector';
import { startOfMonth, endOfMonth, subDays, format } from 'date-fns';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SpendTrack',
  description:
    'تتبَّع مصروفاتك اليوميَّة، حلِّل أنماط إنفاقك، وتحكَّم في ميزانيَّتك مع SpendTrack.',
};

const PAGE_SIZE = 20;

// --- Streaming skeletons ---------------------------------------------------
// The dashboard fans out to ~10 independent Supabase queries. Without a
// Suspense boundary around each section, sibling async Server Components
// render depth-first and the DB round-trips serialize into one long
// waterfall (each block waits for the previous query). Suspense lets React
// start every section's fetch concurrently and stream each card in as its
// data resolves. The skeletons keep the layout height-stable (no CLS).
function StatCardSkeleton() {
  return (
    <Card className="group/card card-lift" aria-hidden="true">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
        <div className="size-8 animate-pulse rounded-lg bg-muted/50" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-32 animate-pulse rounded bg-muted/60" />
        <div className="mt-2 h-3 w-40 animate-pulse rounded bg-muted/40" />
      </CardContent>
    </Card>
  );
}

function SectionSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`w-full animate-pulse rounded-2xl border border-border/60 bg-muted/30 ${className ?? ''}`}
    />
  );
}

function ButtonSkeleton() {
  return <div aria-hidden="true" className="h-10 w-32 animate-pulse rounded-xl bg-muted/50" />;
}

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

async function TotalCard({
  userId,
  start,
  end,
  catFilter,
  currency,
}: {
  userId: string;
  start: string;
  end: string;
  catFilter: string[] | null;
  currency: string;
}) {
  const data = await loadTotalExpenses(userId, start, end, catFilter);
  return (
    <Card
      className="group/card card-lift"
      aria-label={`إجمالي الإنفاق: ${formatMoney(data ?? 0, currency)}`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الإنفاق</CardTitle>
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover/card:bg-primary/15">
          <DollarSign className="size-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl sm:text-3xl font-bold tracking-tight truncate" aria-live="polite">
          {formatMoney(data ?? 0, currency)}
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          {new Intl.DateTimeFormat('ar-SA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            calendar: 'islamic-umalqura',
            numberingSystem: 'latn',
          }).format(new Date(start))}{' '}
          إلى{' '}
          {new Intl.DateTimeFormat('ar-SA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            calendar: 'islamic-umalqura',
            numberingSystem: 'latn',
          }).format(new Date(end))}
        </p>
      </CardContent>
    </Card>
  );
}

async function CreateExpenseButton({
  userId,
  currency,
  autoOpen,
}: {
  userId: string;
  currency: string;
  autoOpen?: boolean;
}) {
  const categories = await loadUserCategories(userId);
  return <CreateExpenseDialog categories={categories} currency={currency} autoOpen={autoOpen} />;
}

async function BudgetSection({ userId, currency }: { userId: string; currency: string }) {
  const now = new Date();
  const month = format(now, 'yyyy-MM');
  const total =
    (await loadTotalExpenses(
      userId,
      format(startOfMonth(now), 'yyyy-MM-dd'),
      format(endOfMonth(now), 'yyyy-MM-dd'),
      null
    )) ?? 0;
  return <BudgetCard month={month} total={total} currency={currency} />;
}

async function CategoryBudgetsSection({ userId }: { userId: string }) {
  const month = format(new Date(), 'yyyy-MM');
  const budgets = await loadCategoryBudgets(userId, month);
  return <CategoryBudgets month={month} initialBudgets={budgets} />;
}

async function RecurringExpensesSection({
  userId,
  currency,
}: {
  userId: string;
  currency: string;
}) {
  const [categories, recurring] = await Promise.all([
    loadUserCategories(userId),
    loadRecurringExpenses(userId),
  ]);
  return (
    <RecurringExpenses categories={categories} initialRecurring={recurring} currency={currency} />
  );
}

async function CategoryPieSection({
  userId,
  start,
  end,
  catFilter,
  currency,
}: {
  userId: string;
  start: string;
  end: string;
  catFilter: string[] | null;
  currency: string;
}) {
  const data = await loadCategoryBreakdown(userId, start, end, catFilter);
  return (
    <Suspense fallback={<ChartsSkeleton />}>
      <CategoryPieChartLazy data={data ?? []} currency={currency} />
    </Suspense>
  );
}

async function DailyBarSection({
  userId,
  start,
  end,
  catFilter,
  currency,
}: {
  userId: string;
  start: string;
  end: string;
  catFilter: string[] | null;
  currency: string;
}) {
  const data = await loadDailyTotals(userId, start, end, catFilter);
  return (
    <Suspense fallback={<ChartsSkeleton />}>
      <DailyBarChartLazy data={data ?? []} currency={currency} />
    </Suspense>
  );
}

async function InsightsSection({
  userId,
  start,
  end,
  catFilter,
  currency,
}: {
  userId: string;
  start: string;
  end: string;
  catFilter: string[] | null;
  currency: string;
}) {
  const insights = await loadInsights(userId, start, end, catFilter);
  return <InsightsStrip insights={insights} currency={currency} />;
}

async function TransactionsSection({
  userId,
  start,
  end,
  filterCategories,
  sort,
  search,
  currency,
}: {
  userId: string;
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
  search?: string;
  currency: string;
}) {
  const {
    expenses: safeExpenses,
    categories: safeCategories,
    totalCount,
  } = await loadTransactions({
    userId,
    start,
    end,
    filterCategories,
    sort,
    pageSize: PAGE_SIZE,
    search,
  });

  return (
    <>
      <TransactionFilters categories={safeCategories} />
      <ExpenseList
        key={`${start}-${end}-${filterCategories.join(',')}-${sort}-${search ?? ''}-${currency}`}
        expenses={safeExpenses}
        categories={safeCategories}
        totalCount={totalCount}
        start={start}
        end={end}
        filterCategories={filterCategories}
        sort={sort}
        search={search}
        currency={currency}
      />
    </>
  );
}

export default async function DashboardPage(props: {
  searchParams: Promise<{
    range?: string;
    categories?: string;
    sort?: string;
    from?: string;
    to?: string;
    search?: string;
    create?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const { user } = await getAuthUser();
  if (!user) redirect('/auth/login?redirect=/spendtrack/app');

  const currency = await loadUserCurrency(user.id);

  const range = searchParams.range || 'this_month';
  const filterCategories = searchParams.categories
    ? searchParams.categories.split(',').filter(Boolean)
    : [];
  const sort = searchParams.sort || 'date_desc';
  const search = searchParams.search?.trim() || undefined;
  const { start, end } = getDateRange(range, searchParams.from, searchParams.to);
  const catFilter: string[] | null = filterCategories.length > 0 ? filterCategories : null;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up">
        <h1 className="text-3xl font-display font-bold tracking-tight">إدارة المصروف</h1>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <CsvActions start={start} end={end} categories={filterCategories} />
          <CurrencySelector currency={currency} />
          <Suspense fallback={<ButtonSkeleton />}>
            <CreateExpenseButton
              userId={user.id}
              currency={currency}
              autoOpen={searchParams.create === '1'}
            />
          </Suspense>
        </div>
      </div>

      <div className="animate-slide-up stagger-2">
        <div className="grid gap-4 md:grid-cols-2">
          <Suspense fallback={<StatCardSkeleton />}>
            <TotalCard
              userId={user.id}
              start={start}
              end={end}
              catFilter={catFilter}
              currency={currency}
            />
          </Suspense>
          <Suspense fallback={<StatCardSkeleton />}>
            <BudgetSection userId={user.id} currency={currency} />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={<SectionSkeleton className="h-40" />}>
        <CategoryBudgetsSection userId={user.id} />
      </Suspense>

      <div className="animate-slide-up stagger-3">
        <Suspense fallback={<SectionSkeleton className="h-28" />}>
          <InsightsSection
            userId={user.id}
            start={start}
            end={end}
            catFilter={catFilter}
            currency={currency}
          />
        </Suspense>
      </div>

      <Suspense fallback={<SectionSkeleton className="h-40" />}>
        <RecurringExpensesSection userId={user.id} currency={currency} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2 animate-slide-up stagger-3">
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
            <Suspense fallback={<ChartsSkeleton />}>
              <CategoryPieSection
                userId={user.id}
                start={start}
                end={end}
                catFilter={catFilter}
                currency={currency}
              />
            </Suspense>
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
            <Suspense fallback={<ChartsSkeleton />}>
              <DailyBarSection
                userId={user.id}
                start={start}
                end={end}
                catFilter={catFilter}
                currency={currency}
              />
            </Suspense>
          </CardContent>
        </Card>
      </div>

      <div className="animate-slide-up stagger-4">
        <Card className="group/card card-lift">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">المعاملات</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <Receipt className="size-3.5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<SectionSkeleton className="h-72" />}>
              <TransactionsSection
                userId={user.id}
                start={start}
                end={end}
                filterCategories={filterCategories}
                sort={sort}
                search={search}
                currency={currency}
              />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
