import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/contracts/database.types';
import type { Category, ExpenseWithCategory } from '@/shared/contracts/spendtrack';

export async function getUserCategories(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Category[]> {
  const { data } = (await supabase
    .from('categories')
    .select('*')
    .or(`user_id.eq.${userId},is_default.eq.true`)
    .order('name')) as { data: Category[] | null };
  return data ?? [];
}

export async function getTotalExpenses(
  supabase: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
  catFilter: string[] | null
): Promise<number | null> {
  const { data } = await supabase.rpc('get_total_expenses', {
    p_user_id: userId,
    p_start: start,
    p_end: end,
    p_categories: catFilter,
  });
  return data;
}

export async function getCategoryBreakdown(
  supabase: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
  catFilter: string[] | null
): Promise<{ category_id: string; color_hex: string; name: string; total: number }[] | null> {
  const { data } = await supabase.rpc('get_category_breakdown', {
    p_user_id: userId,
    p_start: start,
    p_end: end,
    p_categories: catFilter,
  });
  return data;
}

export async function getDailyTotals(
  supabase: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
  catFilter: string[] | null
): Promise<{ date: string; total: number }[] | null> {
  const { data } = await supabase.rpc('get_daily_totals', {
    p_user_id: userId,
    p_start: start,
    p_end: end,
    p_categories: catFilter,
  });
  return data;
}

export interface TransactionsResult {
  expenses: ExpenseWithCategory[];
  categories: Category[];
  totalCount: number;
}

export async function getTransactions(
  supabase: SupabaseClient<Database>,
  userId: string,
  start: string,
  end: string,
  filterCategories: string[],
  sort: string,
  pageSize: number
): Promise<TransactionsResult> {
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

  const { data: expenses } = (await query.limit(pageSize)) as {
    data: ExpenseWithCategory[] | null;
  };

  return {
    expenses: expenses ?? [],
    categories: safeCategories,
    totalCount: totalCount ?? 0,
  };
}
