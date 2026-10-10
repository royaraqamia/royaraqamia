'use client';

import { useCallback, useEffect, useActionState, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  createExpense,
  updateExpense,
  deleteExpense,
  getExpensesPage,
} from '@/frontend/api/spendtrack';
import { useSpendtrackContext } from '@/frontend/state/spendtrack/spendtrack-context';
import type { Category, ExpenseWithCategory } from '@/shared/contracts/spendtrack';

type SaveOptions = {
  amount: string;
  category_id: string;
  date: string;
  description?: string;
  currency?: string;
  splits?: { category_id: string; amount: number }[];
};

function toWriteInput(data: SaveOptions) {
  return {
    amount: Number(data.amount),
    category_id: data.category_id,
    date: data.date,
    description: data.description?.trim() ? data.description : null,
    // Empty string means "inherit"; the server rejects it, so send null.
    currency: data.currency?.trim() ? data.currency : null,
    splits: data.splits,
  };
}

export function useSaveExpense(expenseId?: string) {
  const router = useRouter();
  const store = useSpendtrackContext()?.store ?? null;
  const refresh = useSpendtrackContext()?.refresh;
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const submit = useCallback(
    async (data: SaveOptions): Promise<boolean> => {
      setPending(true);
      setServerError(undefined);
      try {
        // Offline-first: write to the Local Store + Outbox, then let the Sync
        // Engine replay it. The UI renders from the store immediately.
        if (store) {
          if (expenseId) await store.updateExpense(expenseId, toWriteInput(data));
          else await store.createExpense(toWriteInput(data));
          toast.success(expenseId ? 'تم تحديث المصروف بنجاح' : 'تمت إضافة المصروف بنجاح');
          await refresh?.();
          return true;
        }

        const result = expenseId ? await updateExpense(expenseId, data) : await createExpense(data);
        if (result?.success) {
          toast.success(expenseId ? 'تم تحديث المصروف بنجاح' : 'تمت إضافة المصروف بنجاح');
          router.refresh();
          return true;
        }
        if (result?.error) {
          toast.error('حدث خطأ أثناء حفظ المصروف');
          setServerError(result.error);
        }
        return false;
      } finally {
        setPending(false);
      }
    },
    [expenseId, router, store, refresh]
  );

  return { submit, pending, serverError };
}

export function useDeleteExpense(expense: ExpenseWithCategory, description: string) {
  const router = useRouter();
  const context = useSpendtrackContext();
  const store = context?.store ?? null;
  const refresh = context?.refresh;

  const deleteWithId = deleteExpense.bind(null, expense.id);
  const [state, networkAction, networkPending] = useActionState(deleteWithId, undefined);
  const [storePending, setStorePending] = useState(false);
  const [storeError, setStoreError] = useState<string>();

  useEffect(() => {
    if (store || !state?.success) return;
    const restore = () => {
      void createExpense({
        amount: String(expense.amount),
        category_id: expense.category_id,
        date: expense.date,
        description: expense.description ?? undefined,
        currency: expense.currency ?? undefined,
        splits: expense.splits?.map((s) => ({ category_id: s.category_id, amount: s.amount })),
      }).then((result) => {
        if (result?.success) {
          toast.success('تم التراجع عن الحذف', {
            description: `تمت إعادة "${description || 'بدون وصف'}"`,
            duration: 3000,
          });
          router.refresh();
        }
      });
    };
    toast.success('تم حذف المصروف', {
      description: `تم حذف "${description || 'بدون وصف'}" بنجاح`,
      duration: 6000,
      action: { label: 'تراجع', onClick: restore },
    });
    router.refresh();
  }, [store, state, router, description, expense]);

  const storeAction = useCallback(async () => {
    if (!store) return;
    setStorePending(true);
    setStoreError(undefined);
    try {
      await store.deleteExpense(expense.id);
      await refresh?.();
      const restore = () => {
        void store
          .updateExpense(expense.id, {
            amount: expense.amount,
            category_id: expense.category_id,
            date: expense.date,
            description: expense.description,
            currency: expense.currency ?? null,
            splits: expense.splits?.map((s) => ({
              category_id: s.category_id,
              amount: s.amount,
            })),
          })
          .then(() => refresh?.())
          .then(() =>
            toast.success('تم التراجع عن الحذف', {
              description: `تمت إعادة "${description || 'بدون وصف'}"`,
              duration: 3000,
            })
          );
      };
      toast.success('تم حذف المصروف', {
        description: `تم حذف "${description || 'بدون وصف'}" بنجاح`,
        duration: 6000,
        action: { label: 'تراجع', onClick: restore },
      });
    } catch (error) {
      setStoreError(error instanceof Error ? error.message : String(error));
    } finally {
      setStorePending(false);
    }
  }, [store, expense, refresh, description]);

  if (store) {
    return { formAction: storeAction, pending: storePending, error: storeError };
  }
  return { formAction: networkAction, pending: networkPending, error: state?.error };
}

export function useExpensePagination(options: {
  initialExpenses: ExpenseWithCategory[];
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
  totalCount: number;
  search?: string;
}) {
  const context = useSpendtrackContext();
  const [expenses, setExpenses] = useState(options.initialExpenses);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setExpenses(options.initialExpenses);
  }, [options.initialExpenses]);

  const localExpenses = useMemo(() => {
    if (!context?.store) return null;
    return filterLocalExpenses(context.expenses, context.categories, options);
  }, [context?.store, context?.expenses, context?.categories, options]);

  const hasMore = expenses.length < options.totalCount;

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getExpensesPage({
        offset: expenses.length,
        limit: 20,
        start: options.start,
        end: options.end,
        categories: options.filterCategories,
        sort: options.sort,
        search: options.search,
      });
      setExpenses((prev) => [...prev, ...result.expenses]);
    } finally {
      setLoading(false);
    }
  }, [expenses.length, options]);

  if (localExpenses) {
    return { expenses: localExpenses, loading: false, hasMore: false, loadMore };
  }
  return { expenses, loading, hasMore, loadMore };
}

/** Mirrors the server's range/category/search/sort rules over the local rows. */
function filterLocalExpenses(
  rows: ExpenseWithCategory[],
  categories: Category[],
  options: { start: string; end: string; filterCategories: string[]; sort: string; search?: string }
): ExpenseWithCategory[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const term = options.search?.trim().toLowerCase();
  const categorySet = new Set(options.filterCategories);

  const filtered = rows
    .filter((row) => row.date >= options.start && row.date <= options.end)
    .filter((row) => categorySet.size === 0 || categorySet.has(row.category_id))
    .filter((row) => !term || (row.description ?? '').toLowerCase().includes(term))
    .map((row) => ({ ...row, categories: byId.get(row.category_id) }));

  const [field, direction] = options.sort.split('_');
  const ascending = direction === 'asc';
  return filtered.sort((a, b) => {
    if (field === 'amount') return ascending ? a.amount - b.amount : b.amount - a.amount;
    return ascending ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  });
}
