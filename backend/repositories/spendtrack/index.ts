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

const nowIso = () => new Date().toISOString();

/** Surfaces the camelCase offline fields the contract (and Local Store) expect. */
function withOfflineFields<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    clientId: (row.client_id as string | null | undefined) ?? null,
    updatedAt: row.updated_at as string | undefined,
    deletedAt: (row.deleted_at as string | null | undefined) ?? null,
  };
}

export function createSpendtrackRepository(
  supabase: SupabaseClient<Database>
): SpendtrackRepository {
  async function attachSplits(rows: Array<Record<string, unknown>>): Promise<void> {
    const ids = rows.map((r) => r.id as string).filter(Boolean);
    if (ids.length === 0) return;

    const { data: splits } = await supabase
      .from('expense_splits')
      .select('id, expense_id, category_id, amount, client_id, updated_at, deleted_at')
      .in('expense_id', ids)
      .is('deleted_at', null);

    const byExpense = new Map<string, Record<string, unknown>[]>();
    for (const s of splits ?? []) {
      const arr = byExpense.get(s.expense_id) ?? [];
      arr.push(withOfflineFields(s as Record<string, unknown>));
      byExpense.set(s.expense_id, arr);
    }

    for (const row of rows) {
      row.splits = byExpense.get(row.id as string) ?? [];
    }
  }

  return {
    async getUserCategories(userId: string): Promise<Category[]> {
      const { data } = (await supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${userId},is_default.eq.true`)
        .is('deleted_at', null)
        .order('name')) as { data: Array<{ color_hex: string; [key: string]: unknown }> | null };
      return (data ?? []).map(({ color_hex, ...row }) =>
        withOfflineFields({ ...row, colorHex: color_hex })
      ) as Category[];
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
        p_categories: catFilter ?? undefined,
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
        p_categories: catFilter ?? undefined,
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
        p_categories: catFilter ?? undefined,
      });
      return data;
    },

    async getTransactions(
      query: SpendtrackTransactionsQuery
    ): Promise<SpendtrackTransactionsResult> {
      const { userId, start, end, filterCategories, sort, pageSize, offset, search } = query;

      // The categories lookup, the exact-count query, and the page query are
      // independent of each other — issue them concurrently so the dashboard
      // pays one network round-trip instead of three (all use the same
      // user/date/search predicates; the list adds category/sort/paging).
      const categoriesPromise = supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${userId},is_default.eq.true`)
        .order('name');

      let countQuery = supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end);

      if (search && search.trim().length > 0) {
        countQuery = countQuery.ilike('description', `%${search.trim()}%`);
      }

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

      const [{ data: categories }, { count: totalCount }, { data: rawExpenses }] =
        await Promise.all([categoriesPromise, countQuery, queryBuilder]);

      const safeCategories = (
        (categories ?? []) as Array<{
          color_hex: string;
          [key: string]: unknown;
        }>
      ).map(({ color_hex, ...row }) => ({
        ...row,
        colorHex: color_hex,
      })) as Category[];
      const expenses = (rawExpenses ?? []).map((row: Record<string, unknown>) => {
        const cats = row.categories as { name: string; color_hex: string } | null;
        return {
          ...row,
          categories: cats ? { name: cats.name, colorHex: cats.color_hex } : undefined,
        };
      }) as ExpenseWithCategory[];

      await attachSplits(expenses as unknown as Array<Record<string, unknown>>);

      return {
        expenses,
        categories: safeCategories,
        totalCount: totalCount ?? 0,
      };
    },

    async getAllExpenses(
      userId: string,
      start: string,
      end: string,
      catFilter: string[] | null
    ): Promise<ExpenseWithCategory[]> {
      let query = supabase
        .from('expenses')
        .select('*, categories(name, color_hex)')
        .eq('user_id', userId)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true });

      if (catFilter && catFilter.length > 0) {
        query = query.in('category_id', catFilter);
      }

      const { data: rawExpenses } = await query;
      const expenses = (rawExpenses ?? []).map((row: Record<string, unknown>) => {
        const cats = row.categories as { name: string; color_hex: string } | null;
        return {
          ...row,
          categories: cats ? { name: cats.name, colorHex: cats.color_hex } : undefined,
        };
      }) as ExpenseWithCategory[];

      await attachSplits(expenses as unknown as Array<Record<string, unknown>>);
      return expenses;
    },

    async createExpense(input: {
      user_id: string;
      amount: number;
      category_id: string;
      date: string;
      description: string | null;
      currency?: string | null;
      splits?: { category_id: string; amount: number; clientId?: string | null }[];
      clientId?: string | null;
      updatedAt?: string;
    }): Promise<string> {
      const { splits, clientId, updatedAt, ...expense } = input;
      const row = {
        ...expense,
        client_id: clientId ?? null,
        updated_at: updatedAt ?? nowIso(),
      };

      // A client-minted id makes a replayed write an idempotent upsert, and
      // adopting it as the primary key lets offline splits/updates reference a
      // row the server has never seen (ADR-0029, ticket #162/#166).
      let expenseId: string;
      if (clientId && input.user_id) {
        const { data, error } = await supabase
          .from('expenses')
          .upsert({ ...row, id: clientId }, { onConflict: 'user_id,client_id' })
          .select('id')
          .single();
        if (error) throw new Error(error.message);
        expenseId = data.id;
      } else {
        const { data, error } = await supabase.from('expenses').insert(row).select('id').single();
        if (error) throw new Error(error.message);
        expenseId = data.id;
      }

      if (splits !== undefined) {
        // Replace-all so a replay converges on the same split set.
        const { error: delError } = await supabase
          .from('expense_splits')
          .delete()
          .eq('expense_id', expenseId);
        if (delError) throw new Error(delError.message);

        if (splits.length > 0) {
          const { error: splitError } = await supabase.from('expense_splits').insert(
            splits.map((s) => ({
              expense_id: expenseId,
              category_id: s.category_id,
              amount: s.amount,
              client_id: s.clientId ?? null,
            }))
          );
          if (splitError) throw new Error(splitError.message);
        }
      }

      return expenseId;
    },

    async createExpensesMany(
      inputs: {
        user_id: string;
        amount: number;
        category_id: string;
        date: string;
        description: string | null;
      }[]
    ): Promise<void> {
      if (inputs.length === 0) return;
      const { error } = await supabase.from('expenses').insert(inputs);
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
        currency?: string | null;
        splits?: { category_id: string; amount: number; clientId?: string | null }[] | null;
        updatedAt?: string;
        deletedAt?: string | null;
      }
    ): Promise<void> {
      const { splits, updatedAt, deletedAt, ...expense } = input;
      const resurrect = deletedAt === null;

      const row: Database['public']['Tables']['expenses']['Update'] = {
        ...expense,
        updated_at: updatedAt ?? nowIso(),
      };
      if (deletedAt !== undefined) row.deleted_at = deletedAt;

      let query = supabase.from('expenses').update(row).eq('id', expenseId).eq('user_id', userId);
      if (!resurrect) query = query.is('deleted_at', null);

      const { error } = await query;
      if (error) throw new Error(error.message);

      if (splits !== undefined) {
        const { error: delError } = await supabase
          .from('expense_splits')
          .delete()
          .eq('expense_id', expenseId);
        if (delError) throw new Error(delError.message);

        if (splits && splits.length > 0) {
          const { error: insError } = await supabase.from('expense_splits').insert(
            splits.map((s) => ({
              expense_id: expenseId,
              category_id: s.category_id,
              amount: s.amount,
              client_id: s.clientId ?? null,
            }))
          );
          if (insError) throw new Error(insError.message);
        }
      }
    },

    async deleteExpense(
      expenseId: string,
      userId: string,
      meta?: { updatedAt?: string }
    ): Promise<void> {
      // Tombstone, not a hard delete: a replayed delete is idempotent, and reads
      // exclude the row via `deleted_at is null` (ADR-0029, ticket #166).
      const stamp = meta?.updatedAt ?? nowIso();
      const { error } = await supabase
        .from('expenses')
        .update({ deleted_at: stamp, updated_at: stamp })
        .eq('id', expenseId)
        .eq('user_id', userId)
        .is('deleted_at', null);

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
        .eq('month', month)
        .is('deleted_at', null);

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
      categoryId?: string | null,
      meta?: { clientId?: string | null; updatedAt?: string }
    ): Promise<void> {
      const stamp = meta?.updatedAt ?? nowIso();
      const clientId = meta?.clientId ?? null;

      // Budgets dedupe on (user_id, month, category_id) via a partial unique
      // index, so the replay target is that tuple — not a client id. The read
      // deliberately includes tombstones: a re-created budget must resurrect the
      // row that still occupies the unique key rather than insert a duplicate.
      let readQuery = supabase
        .from('budgets')
        .select('id, updated_at, client_id')
        .eq('user_id', userId)
        .eq('month', month);
      readQuery = categoryId
        ? readQuery.eq('category_id', categoryId)
        : readQuery.is('category_id', null);

      const { data: existing } = await readQuery.maybeSingle();

      if (existing) {
        // Last-write-wins: never let an older queued write clobber a newer one.
        if (
          existing.updated_at &&
          meta?.updatedAt &&
          new Date(existing.updated_at).getTime() > new Date(meta.updatedAt).getTime()
        ) {
          return;
        }
        const update: Database['public']['Tables']['budgets']['Update'] = {
          amount,
          updated_at: stamp,
          deleted_at: null,
        };
        if (clientId && !existing.client_id) update.client_id = clientId;

        let updateQuery = supabase
          .from('budgets')
          .update(update)
          .eq('user_id', userId)
          .eq('month', month);
        updateQuery = categoryId
          ? updateQuery.eq('category_id', categoryId)
          : updateQuery.is('category_id', null);

        const { error } = await updateQuery;
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from('budgets').insert({
        user_id: userId,
        month,
        amount,
        category_id: categoryId ?? null,
        client_id: clientId,
        updated_at: stamp,
      });
      if (error) throw new Error(error.message);
    },

    async deleteBudget(
      userId: string,
      month: string,
      categoryId?: string | null,
      meta?: { updatedAt?: string }
    ): Promise<void> {
      const stamp = meta?.updatedAt ?? nowIso();
      let query = supabase
        .from('budgets')
        .update({ deleted_at: stamp, updated_at: stamp })
        .eq('user_id', userId)
        .eq('month', month)
        .is('deleted_at', null);
      query = categoryId ? query.eq('category_id', categoryId) : query.is('category_id', null);
      const { error } = await query;
      if (error) throw new Error(error.message);
    },

    async getRecurringExpenses(userId: string): Promise<RecurringExpense[]> {
      const { data, error } = await supabase
        .from('recurring_expenses')
        .select(
          'id, amount, category_id, description, day_of_month, start_month, active, client_id, updated_at, deleted_at'
        )
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('day_of_month');
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) =>
        withOfflineFields(row as Record<string, unknown>)
      ) as RecurringExpense[];
    },

    async createRecurringExpense(
      userId: string,
      input: RecurringExpenseInput & { clientId?: string | null; updatedAt?: string }
    ): Promise<RecurringExpense> {
      const { clientId, updatedAt, ...fields } = input;
      const row = {
        user_id: userId,
        ...fields,
        client_id: clientId ?? null,
        updated_at: updatedAt ?? nowIso(),
      };
      const columns =
        'id, amount, category_id, description, day_of_month, start_month, active, client_id, updated_at, deleted_at';

      if (clientId) {
        const { data, error } = await supabase
          .from('recurring_expenses')
          .upsert({ ...row, id: clientId }, { onConflict: 'user_id,client_id' })
          .select(columns)
          .single();
        if (error) throw new Error(error.message);
        return withOfflineFields(data as Record<string, unknown>) as RecurringExpense;
      }

      const { data, error } = await supabase
        .from('recurring_expenses')
        .insert(row)
        .select(columns)
        .single();
      if (error) throw new Error(error.message);
      return withOfflineFields(data as Record<string, unknown>) as RecurringExpense;
    },

    async updateRecurringExpense(
      expenseId: string,
      userId: string,
      input: RecurringExpenseInput & { updatedAt?: string; deletedAt?: string | null }
    ): Promise<void> {
      const { updatedAt, deletedAt, ...fields } = input;
      const resurrect = deletedAt === null;
      const row: Database['public']['Tables']['recurring_expenses']['Update'] = {
        ...fields,
        updated_at: updatedAt ?? nowIso(),
      };
      if (deletedAt !== undefined) row.deleted_at = deletedAt;

      let query = supabase
        .from('recurring_expenses')
        .update(row)
        .eq('id', expenseId)
        .eq('user_id', userId);
      if (!resurrect) query = query.is('deleted_at', null);
      const { error } = await query;
      if (error) throw new Error(error.message);
    },

    async deleteRecurringExpense(
      expenseId: string,
      userId: string,
      meta?: { updatedAt?: string }
    ): Promise<void> {
      const stamp = meta?.updatedAt ?? nowIso();
      const { error } = await supabase
        .from('recurring_expenses')
        .update({ deleted_at: stamp, updated_at: stamp })
        .eq('id', expenseId)
        .eq('user_id', userId)
        .is('deleted_at', null);
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
        .eq('month', month)
        .is('deleted_at', null);
      return (data ?? []) as { category_id: string | null; amount: number }[];
    },

    async createCategory(input: {
      user_id: string;
      name: string;
      colorHex: string;
      clientId?: string | null;
      updatedAt?: string;
    }): Promise<void> {
      const { colorHex, clientId, updatedAt, ...rest } = input;
      const row = {
        ...rest,
        color_hex: colorHex,
        client_id: clientId ?? null,
        updated_at: updatedAt ?? nowIso(),
      };

      if (clientId && input.user_id) {
        const { error } = await supabase
          .from('categories')
          .upsert({ ...row, id: clientId }, { onConflict: 'user_id,client_id' });
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from('categories').insert(row);
      if (error) throw new Error(error.message);
    },

    async updateCategory(
      categoryId: string,
      userId: string,
      input: { name: string; colorHex: string; updatedAt?: string; deletedAt?: string | null }
    ): Promise<void> {
      const { colorHex, updatedAt, deletedAt, ...rest } = input;
      const resurrect = deletedAt === null;
      const row: Database['public']['Tables']['categories']['Update'] = {
        ...rest,
        color_hex: colorHex,
        updated_at: updatedAt ?? nowIso(),
      };
      if (deletedAt !== undefined) row.deleted_at = deletedAt;

      let query = supabase
        .from('categories')
        .update(row)
        .eq('id', categoryId)
        .eq('user_id', userId);
      if (!resurrect) query = query.is('deleted_at', null);

      const { error } = await query;
      if (error) throw new Error(error.message);
    },

    async deleteCategory(
      categoryId: string,
      userId: string,
      meta?: { updatedAt?: string }
    ): Promise<void> {
      const stamp = meta?.updatedAt ?? nowIso();
      const { error } = await supabase
        .from('categories')
        .update({ deleted_at: stamp, updated_at: stamp })
        .eq('id', categoryId)
        .eq('user_id', userId)
        .is('deleted_at', null);

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
      const { error } = await supabase.from('user_settings').insert({ user_id: userId, currency });
      if (error) throw new Error(error.message);
    },
  };
}
