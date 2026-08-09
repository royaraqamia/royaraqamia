import 'server-only';

import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createSpendtrackService } from '@/backend/config/spendtrack';
import type {
  Category,
  CategoryBudget,
  RecurringExpense,
  SpendInsights,
  SpendtrackTransactionsQuery,
  SpendtrackTransactionsResult,
} from '@/shared/contracts/spendtrack';

async function createService() {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createSpendtrackService(supabase);
}

export async function loadUserCategories(userId: string): Promise<Category[]> {
  const service = await createService();
  return service.getUserCategories(userId);
}

export async function loadTotalExpenses(
  userId: string,
  start: string,
  end: string,
  catFilter: string[] | null
): Promise<number | null> {
  const service = await createService();
  return service.getTotalExpenses(userId, start, end, catFilter);
}

export async function loadCategoryBreakdown(
  userId: string,
  start: string,
  end: string,
  catFilter: string[] | null
): Promise<{ categoryId: string; colorHex: string; name: string; total: number }[] | null> {
  const service = await createService();
  return service.getCategoryBreakdown(userId, start, end, catFilter);
}

export async function loadDailyTotals(
  userId: string,
  start: string,
  end: string,
  catFilter: string[] | null
): Promise<{ date: string; total: number }[] | null> {
  const service = await createService();
  return service.getDailyTotals(userId, start, end, catFilter);
}

export async function loadTransactions(
  query: SpendtrackTransactionsQuery
): Promise<SpendtrackTransactionsResult> {
  const service = await createService();
  return service.getTransactions(query);
}

export async function loadCategoryBudgets(
  userId: string,
  month: string
): Promise<CategoryBudget[]> {
  const service = await createService();
  const categories = await service.getUserCategories(userId);
  return service.getCategoryBudgets(userId, month, categories);
}

export async function loadRecurringExpenses(userId: string): Promise<RecurringExpense[]> {
  const service = await createService();
  return service.getRecurringExpenses(userId);
}

export async function loadUserCurrency(userId: string): Promise<string> {
  const service = await createService();
  return service.getCurrency(userId);
}

export async function loadInsights(
  userId: string,
  start: string,
  end: string,
  catFilter: string[] | null
): Promise<SpendInsights> {
  const service = await createService();
  return service.getInsights(userId, start, end, catFilter);
}
