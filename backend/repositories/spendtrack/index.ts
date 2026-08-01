import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/shared/contracts/database.types';
import type { Category, ExpenseWithCategory } from '@/shared/contracts/spendtrack';
import type {
  ISpendtrackRepository,
  SpendtrackTransactionsQuery,
  SpendtrackTransactionsResult,
} from '@/backend/ports/spendtrack/repository';

export function createSpendtrackRepository(
  supabase: SupabaseClient<Database>
): ISpendtrackRepository {
  return {
    async getUserCategories(userId: string): Promise<Category[]> {
      const { data } = (await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${userId},is_default.eq.true`)
        .order('name')) as { data: Category[] | null };
      return data ?? [];
    },

    async getTotalExpenses(
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
    },

    async getCategoryBreakdown(
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
    },

    async getDailyTotals(
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
    },

    async getTransactions(
      query: SpendtrackTransactionsQuery
    ): Promise<SpendtrackTransactionsResult> {
      const { userId, start, end, filterCategories, sort, pageSize, offset } = query;

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

      let queryBuilder = supabase
        .from('expenses')
        .select('*, categories(name, color_hex)')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end);

      if (filterCategories.length > 0) {
        queryBuilder = queryBuilder.in('category_id', filterCategories);
      }

      const sortParts = sort.split('_');
      const sortField = sortParts[0] === 'amount' ? 'amount' : 'date';
      const sortAsc = sortParts[1] === 'asc';
      queryBuilder = queryBuilder.order(sortField, { ascending: sortAsc });

      if (offset !== undefined) {
        queryBuilder = queryBuilder.range(offset, offset + pageSize - 1);
      } else {
        queryBuilder = queryBuilder.limit(pageSize);
      }

      const { data: expenses } = (await queryBuilder) as {
        data: ExpenseWithCategory[] | null;
      };

      return {
        expenses: expenses ?? [],
        categories: safeCategories,
        totalCount: totalCount ?? 0,
      };
    },

    async createExpense(input: {
      user_id: string;
      amount: number;
      category_id: string;
      date: string;
      description: string | null;
    }): Promise<void> {
      const { error } = await supabase.from('expenses').insert(input);
      if (error) throw new Error(error.message);
    },

    async updateExpense(
      expenseId: string,
      userId: string,
      input: {
        amount: number;
        category_id: string;
        date: string;
        description: string | null;
      }
    ): Promise<void> {
      const { error } = await supabase
        .from('expenses')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', expenseId)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
    },

    async deleteExpense(expenseId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
    },

    async createCategory(input: {
      user_id: string;
      name: string;
      color_hex: string;
    }): Promise<void> {
      const { error } = await supabase.from('categories').insert(input);
      if (error) throw new Error(error.message);
    },

    async updateCategory(
      categoryId: string,
      userId: string,
      input: { name: string; color_hex: string }
    ): Promise<void> {
      const { error } = await supabase
        .from('categories')
        .update(input)
        .eq('id', categoryId)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
    },

    async deleteCategory(categoryId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
    },
  };
}
