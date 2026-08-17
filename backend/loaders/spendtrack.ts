import 'server-only';

import { cache } from 'react';
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

// A SpendTrack dashboard render fans out to ~10 independent loader calls.
// cache() dedupes the async cookie-store read + Supabase client construction
// so the whole request shares one client instead of building a new one (and
// re-awaiting next/headers cookies) on every loader call.
const createService = cache(async () => {
  const cookieStore = await cookies();
  const supabase = await createServerSupabaseClient(cookieStore);
  return createSpendtrackService(supabase);
});

// Each loader is also request-deduplicated with React cache(): the SpendTrack
// dashboard renders many sections that call the same loader with the same
// arguments (e.g. loadUserCategories is invoked by the create-expense button,
// the recurring section AND inside loadCategoryBudgets; loadTotalExpenses by
// both the total card and the budget card when the range is the current
// month). Without dedupe, one dashboard render issues the same query 3x.
// cache() is per-request only — zero staleness risk.
export const loadUserCategories = cache(async (userId: string): Promise<Category[]> => {
  const service = await createService();
  return service.getUserCategories(userId);
});

export const loadTotalExpenses = cache(
  async (
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<number | null> => {
    const service = await createService();
    return service.getTotalExpenses(userId, start, end, catFilter);
  }
);

export const loadCategoryBreakdown = cache(
  async (
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<{ categoryId: string; colorHex: string; name: string; total: number }[] | null> => {
    const service = await createService();
    return service.getCategoryBreakdown(userId, start, end, catFilter);
  }
);

export const loadDailyTotals = cache(
  async (
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<{ date: string; total: number }[] | null> => {
    const service = await createService();
    return service.getDailyTotals(userId, start, end, catFilter);
  }
);

export const loadTransactions = cache(
  async (query: SpendtrackTransactionsQuery): Promise<SpendtrackTransactionsResult> => {
    const service = await createService();
    return service.getTransactions(query);
  }
);

export const loadCategoryBudgets = cache(
  async (userId: string, month: string): Promise<CategoryBudget[]> => {
    const service = await createService();
    const categories = await service.getUserCategories(userId);
    return service.getCategoryBudgets(userId, month, categories);
  }
);

export const loadRecurringExpenses = cache(async (userId: string): Promise<RecurringExpense[]> => {
  const service = await createService();
  return service.getRecurringExpenses(userId);
});

export const loadUserCurrency = cache(async (userId: string): Promise<string> => {
  const service = await createService();
  return service.getCurrency(userId);
});

export const loadInsights = cache(
  async (
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<SpendInsights> => {
    const service = await createService();
    return service.getInsights(userId, start, end, catFilter);
  }
);
