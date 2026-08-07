import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  Category,
  ExpenseWithCategory,
  RecurringExpense,
  RecurringExpenseInput,
  SpendtrackTransactionsQuery,
  SpendtrackTransactionsResult,
} from '@/shared/contracts/spendtrack';
import type { SpendtrackRepository } from '@/backend/repositories/spendtrack/spendtrack-repository';

export function createSpendtrackRepository(
  supabase: SupabaseClient<Database>
): SpendtrackRepository {
  return {
    async getUserCategories(userId: string): Promise<Category[]> {
      const { data } = (await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${userId},is_default.eq.true`)
        .order('name')) as { data: Array<{ color_hex: string; [key: string]: unknown }> | null };
      return (data ?? []).map(({ color_hex, ...row }) => ({
        ...row,
        colorHex: color_hex,
      })) as Category[];
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
    ): Promise<{ categoryId: string; colorHex: string; name: string; total: number }[] | null> {
      const { data } = await supabase.rpc('get_category_breakdown', {
        p_user_id: userId,
        p_start: start,
        p_end: end,
        p_categories: catFilter,
      });
      if (!data) return null;
      return data.map(
        (row: { category_id: string; color_hex: string; name: string; total: number }) => ({
          categoryId: row.category_id,
          colorHex: row.color_hex,
          name: row.name,
          total: row.total,
        })
      );
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
      const { userId, start, end, filterCategories, sort, pageSize, offset, search } = query;

      const { data: categories } = (await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${userId},is_default.eq.true`)
        .order('name')) as { data: Array<{ color_hex: string; [key: string]: unknown }> | null };

      const safeCategories = (categories ?? []).map(({ color_hex, ...row }) => ({
        ...row,
        colorHex: color_hex,
      })) as Category[];

      let countQuery = supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end);

      if (search && search.trim().length > 0) {
        countQuery = countQuery.ilike('description', `%${search.trim()}%`);
      }

      const { count: totalCount } = await countQuery;

      let queryBuilder = supabase
        .from('expenses')
        .select('*, categories(name, color_hex)')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end);

      if (search && search.trim().length > 0) {
        queryBuilder = queryBuilder.ilike('description', `%${search.trim()}%`);
      }

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

      const { data: rawExpenses } = await queryBuilder;
      const expenses = (rawExpenses ?? []).map((row: Record<string, unknown>) => {
        const cats = row.categories as { name: string; color_hex: string } | null;
        return {
          ...row,
          categories: cats ? { name: cats.name, colorHex: cats.color_hex } : undefined,
        };
      }) as ExpenseWithCategory[];

      return {
        expenses: expenses,
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

    async getBudget(
      userId: string,
      month: string,
      categoryId?: string | null
    ): Promise<number | null> {
      let query = supabase
        .from('budgets')
        .select('amount')
        .eq('user_id', userId)
        .eq('month', month);

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      } else {
        query = query.is('category_id', null);
      }

      const { data } = await query.maybeSingle();
      return data ? Number(data.amount) : null;
    },

    async setBudget(
      userId: string,
      month: string,
      amount: number,
      categoryId?: string | null
    ): Promise<void> {
      const rowUpdate = { amount, updated_at: new Date().toISOString() };

      if (categoryId) {
        const { data: existing } = await supabase
          .from('budgets')
          .select('id')
          .eq('user_id', userId)
          .eq('month', month)
          .eq('category_id', categoryId)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase
            .from('budgets')
            .update(rowUpdate)
            .eq('user_id', userId)
            .eq('month', month)
            .eq('category_id', categoryId);
          if (error) throw new Error(error.message);
          return;
        }
        const { error } = await supabase.from('budgets').insert({
          user_id: userId,
          month,
          amount,
          category_id: categoryId,
        });
        if (error) throw new Error(error.message);
        return;
      }

      const { data: existing } = await supabase
        .from('budgets')
        .select('id')
        .eq('user_id', userId)
        .eq('month', month)
        .is('category_id', null)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from('budgets')
          .update(rowUpdate)
          .eq('user_id', userId)
          .eq('month', month)
          .is('category_id', null);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from('budgets').insert({
        user_id: userId,
        month,
        amount,
        category_id: null,
      });
      if (error) throw new Error(error.message);
    },

    async deleteBudget(userId: string, month: string, categoryId?: string | null): Promise<void> {
      const { error } = categoryId
        ? await supabase
            .from('budgets')
            .delete()
            .eq('user_id', userId)
            .eq('month', month)
            .eq('category_id', categoryId)
        : await supabase
            .from('budgets')
            .delete()
            .eq('user_id', userId)
            .eq('month', month)
            .is('category_id', null);
      if (error) throw new Error(error.message);
    },

    async getRecurringExpenses(userId: string): Promise<RecurringExpense[]> {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select('id, amount, category_id, description, day_of_month, start_month, active')
        .eq('user_id', userId)
        .order('day_of_month');
      if (error) throw new Error(error.message);
      return (data ?? []) as RecurringExpense[];
    },

    async createRecurringExpense(
      userId: string,
      input: RecurringExpenseInput
    ): Promise<RecurringExpense> {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .insert({ user_id: userId, ...input })
        .select('id, amount, category_id, description, day_of_month, start_month, active')
        .single();
      if (error) throw new Error(error.message);
      return data as RecurringExpense;
    },

    async updateRecurringExpense(
      expenseId: string,
      userId: string,
      input: RecurringExpenseInput
    ): Promise<void> {
      const { error } = await supabase
        .from('recurring_expenses')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', expenseId)
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
    },

    async deleteRecurringExpense(expenseId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('recurring_expenses')
        .delete()
        .eq('id', expenseId)
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
    },

    async getBudgets(
      userId: string,
      month: string
    ): Promise<{ category_id: string | null; amount: number }[]> {
      const { data } = await supabase
        .from('budgets')
        .select('category_id, amount')
        .eq('user_id', userId)
        .eq('month', month);
      return (data ?? []) as { category_id: string | null; amount: number }[];
    },

    async createCategory(input: {
      user_id: string;
      name: string;
      colorHex: string;
    }): Promise<void> {
      const { colorHex, ...rest } = input;
      const { error } = await supabase.from('categories').insert({ ...rest, color_hex: colorHex });
      if (error) throw new Error(error.message);
    },

    async updateCategory(
      categoryId: string,
      userId: string,
      input: { name: string; colorHex: string }
    ): Promise<void> {
      const { colorHex, ...rest } = input;
      const { error } = await supabase
        .from('categories')
        .update({ ...rest, color_hex: colorHex })
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

    async getUserCurrency(userId: string): Promise<string | null> {
      const { data, error } = await supabase
        .from('user_settings')
        .select('currency')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? (data.currency as string) : null;
    },

    async setUserCurrency(userId: string, currency: string): Promise<void> {
      const { data: existing, error: readError } = await supabase
        .from('user_settings')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (existing) {
        const { error } = await supabase
          .from('user_settings')
          .update({ currency, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (error) throw new Error(error.message);
        return;
      }
      const { error } = await supabase
        .from('user_settings')
        .insert({ user_id: userId, currency });
      if (error) throw new Error(error.message);
    },
  };
}
