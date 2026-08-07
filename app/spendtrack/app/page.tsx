import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/ui/primitives/card';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { DollarSign, PieChartIcon, TrendingUp, Receipt } from 'lucide-react';
import { CreateExpenseDialog } from '@/frontend/ui/spendtrack/expense-dialog';
import { BudgetCard } from '@/frontend/ui/spendtrack/budget-card';
import { ExpenseList } from '@/frontend/ui/spendtrack/expense-list';
import { CategoryPieChart } from '@/frontend/ui/spendtrack/category-pie-chart';
import { DailyBarChart } from '@/frontend/ui/spendtrack/daily-bar-chart';
import { TransactionFilters } from '@/frontend/ui/spendtrack/transaction-filters';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import {
  loadCategoryBreakdown,
  loadDailyTotals,
  loadTotalExpenses,
  loadTransactions,
  loadUserCategories,
} from '@/backend/loaders/spendtrack';
import { startOfMonth, endOfMonth, subDays, format } from 'date-fns';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'SpendTrack',
  description:
    'تتبَّع مصروفاتك اليوميَّة، حلِّل أنماط إنفاقك، وتحكَّم في ميزانيَّتك مع SpendTrack.',
};

const PAGE_SIZE = 20;

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
}: {
  userId: string;
  start: string;
  end: string;
  catFilter: string[] | null;
}) {
  const data = await loadTotalExpenses(userId, start, end, catFilter);
  return (
    <Card
      className="group/card card-lift"
      aria-label={`إجمالي الإنفاق: ${Number(data ?? 0).toFixed(2)} دولار`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الإنفاق</CardTitle>
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 transition-colors duration-300 group-hover/card:bg-primary/15">
          <DollarSign className="size-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl sm:text-3xl font-bold tracking-tight truncate" aria-live="polite">
          ${Number(data ?? 0).toFixed(2)}
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

async function CreateExpenseButton({ userId }: { userId: string }) {
  const categories = await loadUserCategories(userId);
  return <CreateExpenseDialog categories={categories} />;
}

async function BudgetSection({ userId }: { userId: string }) {
  const now = new Date();
  const month = format(now, 'yyyy-MM');
  const total =
    (await loadTotalExpenses(
      userId,
      format(startOfMonth(now), 'yyyy-MM-dd'),
      format(endOfMonth(now), 'yyyy-MM-dd'),
      null
    )) ?? 0;
  return <BudgetCard month={month} total={total} />;
}

async function CategoryPieSection({
  userId,
  start,
  end,
  catFilter,
}: {
  userId: string;
  start: string;
  end: string;
  catFilter: string[] | null;
}) {
  const data = await loadCategoryBreakdown(userId, start, end, catFilter);
  return <CategoryPieChart data={data ?? []} />;
}

async function DailyBarSection({
  userId,
  start,
  end,
  catFilter,
}: {
  userId: string;
  start: string;
  end: string;
  catFilter: string[] | null;
}) {
  const data = await loadDailyTotals(userId, start, end, catFilter);
  return <DailyBarChart data={data ?? []} />;
}

async function TransactionsSection({
  userId,
  start,
  end,
  filterCategories,
  sort,
  search,
}: {
  userId: string;
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
  search?: string;
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
        key={`${start}-${end}-${filterCategories.join(',')}-${sort}-${search ?? ''}`}
        expenses={safeExpenses}
        categories={safeCategories}
        totalCount={totalCount}
        start={start}
        end={end}
        filterCategories={filterCategories}
        sort={sort}
        search={search}
      />
    </>
  );
}

function TotalSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الإنفاق</CardTitle>
        <DollarSign className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-9 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-50 sm:h-75 w-full rounded-xl" />;
}

function TransactionsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>المعاملات</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-13 w-full" />
        ))}
      </CardContent>
    </Card>
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
  }>;
}) {
  const searchParams = await props.searchParams;
  const { user } = await getAuthUser();
  if (!user) redirect('/auth/login?redirect=/spendtrack');

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
        <CreateExpenseButton userId={user.id} />
      </div>

      <div className="animate-slide-up stagger-2">
        <div className="grid gap-4 md:grid-cols-2">
          <Suspense fallback={<TotalSkeleton />}>
            <TotalCard userId={user.id} start={start} end={end} catFilter={catFilter} />
          </Suspense>
          <Suspense fallback={<TotalSkeleton />}>
            <BudgetSection userId={user.id} />
          </Suspense>
        </div>
      </div>

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
            <Suspense fallback={<ChartSkeleton />}>
              <CategoryPieSection userId={user.id} start={start} end={end} catFilter={catFilter} />
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
            <Suspense fallback={<ChartSkeleton />}>
              <DailyBarSection userId={user.id} start={start} end={end} catFilter={catFilter} />
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
            <Suspense fallback={<TransactionsSkeleton />}>
              <TransactionsSection
                userId={user.id}
                start={start}
                end={end}
                filterCategories={filterCategories}
                sort={sort}
                search={search}
              />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
