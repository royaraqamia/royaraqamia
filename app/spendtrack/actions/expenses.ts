'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { ExpenseWithCategory } from '@/domains/spendtrack/lib/database.types';

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

  const { error } = await supabase.from('expenses').insert({
    user_id: user.id,
    amount,
    category_id,
    date,
    description,
  });

  if (error) return { error: error.message };
  revalidatePath('/spendtrack/dashboard');
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

  const { error } = await supabase
    .from('expenses')
    .update({ amount, category_id, date, description, updated_at: new Date().toISOString() })
    .eq('id', expenseId)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/spendtrack/dashboard');
  return { success: true };
}

export async function deleteExpense(expenseId: string, _prevState: ActionState) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const { error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/spendtrack/dashboard');
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

  let query = supabase
    .from('expenses')
    .select('*, categories(name, color_hex)')
    .eq('user_id', user.id)
    .gte('date', options.start)
    .lte('date', options.end);

  if (options.categories.length > 0) {
    query = query.in('category_id', options.categories);
  }

  const [sortField, sortDir] = options.sort.split('_') as [string, string];
  query = query.order(sortField === 'amount' ? 'amount' : 'date', {
    ascending: sortDir === 'asc',
  });

  const { data: expenses } = (await query.range(
    options.offset,
    options.offset + options.limit - 1
  )) as { data: ExpenseWithCategory[] | null };

  return { expenses: expenses ?? [] };
}
