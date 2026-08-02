'use server';

import { createClient } from '@/backend/transport/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';
import type { ExpenseWithCategory } from '@/shared/contracts/spendtrack';

type ActionState = { error?: string; success?: boolean } | undefined;

export async function createExpense(_prevState: ActionState, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const amount = parseFloat(formData.get('amount') as string);
  const category_id = formData.get('category_id') as string;
  const date = formData.get('date') as string;
  const description =
    String(formData.get('description') ?? '')
      .trim()
      .slice(0, 200) || null;

  if (isNaN(amount) || amount <= 0) return { error: 'مبلغ غير صالح' };
  if (!category_id) return { error: 'التصنيف مطلوب' };
  if (!date) return { error: 'التاريخ مطلوب' };

  try {
    await createSpendtrackRepository(supabase).createExpense({
      user_id: user.id,
      amount,
      category_id,
      date,
      description,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل إنشاء المصروف' };
  }

  revalidatePath('/spendtrack', 'layout');
  return { success: true };
}

export async function updateExpense(
  expenseId: string,
  _prevState: ActionState,
  formData: FormData
) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const amount = parseFloat(formData.get('amount') as string);
  const category_id = formData.get('category_id') as string;
  const date = formData.get('date') as string;
  const description =
    String(formData.get('description') ?? '')
      .trim()
      .slice(0, 200) || null;

  if (isNaN(amount) || amount <= 0) return { error: 'مبلغ غير صالح' };

  try {
    await createSpendtrackRepository(supabase).updateExpense(expenseId, user.id, {
      amount,
      category_id,
      date,
      description,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل تحديث المصروف' };
  }

  revalidatePath('/spendtrack', 'layout');
  return { success: true };
}

export async function deleteExpense(expenseId: string, _prevState: ActionState) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  try {
    await createSpendtrackRepository(supabase).deleteExpense(expenseId, user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل حذف المصروف' };
  }

  revalidatePath('/spendtrack', 'layout');
  return { success: true };
}

export async function getExpensesPage(options: {
  offset: number;
  limit: number;
  start: string;
  end: string;
  categories: string[];
  sort: string;
}): Promise<{ expenses: ExpenseWithCategory[] }> {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('غير مصرح');

  const { expenses } = await createSpendtrackRepository(supabase).getTransactions({
    userId: user.id,
    start: options.start,
    end: options.end,
    filterCategories: options.categories,
    sort: options.sort,
    pageSize: options.limit,
    offset: options.offset,
  });

  return { expenses };
}
