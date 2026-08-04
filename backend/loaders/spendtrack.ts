import 'server-only';

import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createSpendtrackService } from '@/backend/config/spendtrack';
import type {
  SpendtrackTransactionsQuery,
  SpendtrackTransactionsResult,
} from '@/backend/repositories/spendtrack/spendtrack-repository';
import type { Category } from '@/shared/contracts/spendtrack';

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
