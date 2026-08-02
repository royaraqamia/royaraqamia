'use client';

import { useCallback, useEffect, useActionState, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  createExpense,
  updateExpense,
  deleteExpense,
  getExpensesPage,
} from '@/frontend/api/spendtrack';
import type { ExpenseWithCategory } from '@/shared/contracts/spendtrack';

type SaveOptions = {
  amount: string;
  category_id: string;
  date: string;
  description?: string;
};

export function useSaveExpense(expenseId?: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const submit = useCallback(
    async (data: SaveOptions): Promise<boolean> => {
      setPending(true);
      setServerError(undefined);
      try {
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
    [expenseId, router]
  );

  return { submit, pending, serverError };
}

export function useDeleteExpense(expenseId: string, description: string) {
  const router = useRouter();
  const deleteWithId = deleteExpense.bind(null, expenseId);
  const [state, formAction, pending] = useActionState(deleteWithId, undefined);

  useEffect(() => {
    if (state?.success) {
      toast.success('تم حذف المصروف', {
        description: `تم حذف "${description || 'بدون وصف'}" بنجاح`,
        duration: 4000,
      });
      router.refresh();
    }
  }, [state, router, description]);

  return { formAction, pending, error: state?.error };
}

export function useExpensePagination(options: {
  initialExpenses: ExpenseWithCategory[];
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
  totalCount: number;
}) {
  const [expenses, setExpenses] = useState(options.initialExpenses);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setExpenses(options.initialExpenses);
  }, [options.initialExpenses]);

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
      });
      setExpenses((prev) => [...prev, ...result.expenses]);
    } finally {
      setLoading(false);
    }
  }, [expenses.length, options]);

  return { expenses, loading, hasMore, loadMore };
}
