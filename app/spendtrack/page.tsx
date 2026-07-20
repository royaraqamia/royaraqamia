import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DollarSign, PieChartIcon, TrendingUp, Receipt } from 'lucide-react';
import { CreateExpenseDialog } from '@/components/spendtrack/expense-dialog';
import { ExpenseList } from '@/components/spendtrack/expense-list';
import { CategoryPieChart } from '@/components/spendtrack/category-pie-chart';
import { DailyBarChart } from '@/components/spendtrack/daily-bar-chart';
import { TransactionFilters } from '@/components/spendtrack/transaction-filters';
import { getAuthUser } from '@/domains/spendtrack/lib/auth-guard';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { startOfMonth, endOfMonth, subDays, format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { Category, ExpenseWithCategory } from '@/domains/spendtrack/lib/database.types';

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
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data } = await supabase.rpc('get_total_expenses', {
    p_user_id: userId,
    p_start: start,
    p_end: end,
    p_categories: catFilter ?? [],
  });
  return (
    <Card
      className="group/card transition-all duration-300 hover:premium-shadow-lg hover:-translate-y-0.5"
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
          {format(new Date(start), 'd MMMM yyyy', { locale: ar })} إلى{' '}
          {format(new Date(end), 'd MMMM yyyy', { locale: ar })}
        </p>
      </CardContent>
    </Card>
  );
}

async function CreateExpenseButton({ userId }: { userId: string }) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: categories } = (await supabase
    .from('categories')
    .select('*')
    .or(`user_id.eq.${userId},is_default.eq.true`)
    .order('name')) as { data: Category[] | null };
  return <CreateExpenseDialog categories={categories ?? []} />;
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
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data } = await supabase.rpc('get_category_breakdown', {
    p_user_id: userId,
    p_start: start,
    p_end: end,
    p_categories: catFilter ?? [],
  });
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
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data } = await supabase.rpc('get_daily_totals', {
    p_user_id: userId,
    p_start: start,
    p_end: end,
    p_categories: catFilter ?? [],
  });
  return <DailyBarChart data={data ?? []} />;
}

async function TransactionsSection({
  userId,
  start,
  end,
  filterCategories,
  sort,
}: {
  userId: string;
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
}) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const { data: categories } = (await supabase
    .from('categories')
    .select('*')
    .or(`user_id.eq.${userId},is_default.eq.true`)
    .order('name')) as { data: Category[] | null };

  const safeCategories = categories ?? [];

  const { count: totalCount } = await supabase
    .from('expenses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end);

  let query = supabase
    .from('expenses')
    .select('*, categories(name, color_hex)')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end);

  if (filterCategories.length > 0) {
    query = query.in('category_id', filterCategories);
  }

  const sortParts = sort.split('_');
  const sortField = sortParts[0] === 'amount' ? 'amount' : 'date';
  const sortAsc = sortParts[1] === 'asc';
  query = query.order(sortField, { ascending: sortAsc });

  const { data: expenses } = (await query.limit(PAGE_SIZE)) as {
    data: ExpenseWithCategory[] | null;
  };
  const safeExpenses = expenses ?? [];

  return (
    <>
      <TransactionFilters categories={safeCategories} />
      <ExpenseList
        key={`${start}-${end}-${filterCategories.join(',')}-${sort}`}
        expenses={safeExpenses}
        categories={safeCategories}
        totalCount={totalCount ?? 0}
        start={start}
        end={end}
        filterCategories={filterCategories}
        sort={sort}
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
  return <Skeleton className="h-[200px] sm:h-[300px] w-full rounded-xl" />;
}

function TransactionsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>المعاملات</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[52px] w-full" />
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
  const { start, end } = getDateRange(range, searchParams.from, searchParams.to);
  const catFilter: string[] | null = filterCategories.length > 0 ? filterCategories : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up">
        <h1 className="text-2xl font-bold tracking-tight font-heading">لوحة التحكم</h1>
        <CreateExpenseButton userId={user.id} />
      </div>

      <div className="animate-slide-up stagger-2">
        <Suspense fallback={<TotalSkeleton />}>
          <TotalCard userId={user.id} start={start} end={end} catFilter={catFilter} />
        </Suspense>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 animate-slide-up stagger-3">
        <Card
          className="group/card transition-all duration-300 hover:premium-shadow-md"
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
          className="group/card transition-all duration-300 hover:premium-shadow-md"
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
        <Card>
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
              />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
