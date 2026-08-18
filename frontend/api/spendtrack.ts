import type { ExpenseWithCategory, RecurringExpenseInput } from '@/shared/contracts/spendtrack';
import { request } from '@/frontend/transport/http';

type ActionState = { error?: string; success?: boolean } | undefined;

type ExpenseInput = {
  amount: string;
  category_id: string;
  date: string;
  description?: string;
  currency?: string;
  splits?: { category_id: string; amount: number }[];
};

type ExpensePayload = {
  amount: number;
  category_id: string;
  date: string;
  description: string | null;
  currency?: string | null;
  splits?: { category_id: string; amount: number }[];
};

function toPayload(input: ExpenseInput): ExpensePayload {
  return {
    amount: Number(input.amount),
    category_id: input.category_id,
    date: input.date,
    description: input.description?.trim()?.slice(0, 200) || null,
    currency: input.currency ?? null,
    splits: input.splits && input.splits.length > 0 ? input.splits : undefined,
  };
}

export async function createExpense(data: ExpenseInput): Promise<ActionState> {
  try {
    await request('/spendtrack/api/expenses', {
      method: 'POST',
      body: JSON.stringify(toPayload(data)),
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل إنشاء المصروف' };
  }
}

export async function updateExpense(expenseId: string, data: ExpenseInput): Promise<ActionState> {
  try {
    await request(`/spendtrack/api/expenses/${expenseId}`, {
      method: 'PATCH',
      body: JSON.stringify(toPayload(data)),
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل تحديث المصروف' };
  }
}

export async function deleteExpense(expenseId: string): Promise<ActionState> {
  try {
    await request(`/spendtrack/api/expenses/${expenseId}`, { method: 'DELETE' });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل حذف المصروف' };
  }
}

export async function getBudget(month: string, categoryId?: string): Promise<number | null> {
  const params = new URLSearchParams({ month });
  if (categoryId) params.set('categoryId', categoryId);
  const data = await request<{ budget: number | null }>(
    `/spendtrack/api/budget?${params.toString()}`
  );
  return data?.budget ?? null;
}

export async function setBudgetForMonth(
  month: string,
  amount: number,
  categoryId?: string
): Promise<ActionState> {
  try {
    await request('/spendtrack/api/budget', {
      method: 'PUT',
      body: JSON.stringify({ month, amount, categoryId }),
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل حفظ الميزانية' };
  }
}

export async function deleteBudgetForMonth(
  month: string,
  categoryId?: string
): Promise<ActionState> {
  try {
    const params = new URLSearchParams({ month });
    if (categoryId) params.set('categoryId', categoryId);
    await request(`/spendtrack/api/budget?${params.toString()}`, { method: 'DELETE' });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل حذف الميزانية' };
  }
}

export async function createRecurringExpense(data: RecurringExpenseInput): Promise<ActionState> {
  try {
    await request('/spendtrack/api/recurring', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل إنشاء المصروف المتكرر' };
  }
}

export async function updateRecurringExpense(
  id: string,
  data: RecurringExpenseInput
): Promise<ActionState> {
  try {
    await request(`/spendtrack/api/recurring/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل تحديث المصروف المتكرر' };
  }
}

export async function deleteRecurringExpense(id: string): Promise<ActionState> {
  try {
    await request(`/spendtrack/api/recurring/${id}`, { method: 'DELETE' });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل حذف المصروف المتكرر' };
  }
}

export async function createCategory(data: {
  name: string;
  colorHex: string;
}): Promise<ActionState> {
  try {
    await request('/spendtrack/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل إنشاء التصنيف' };
  }
}

export async function updateCategory(
  categoryId: string,
  data: { name: string; colorHex: string }
): Promise<ActionState> {
  try {
    await request(`/spendtrack/api/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل تحديث التصنيف' };
  }
}

export async function deleteCategory(categoryId: string): Promise<ActionState> {
  try {
    await request(`/spendtrack/api/categories/${categoryId}`, { method: 'DELETE' });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل حذف التصنيف' };
  }
}

export async function getExpensesPage(options: {
  offset: number;
  limit: number;
  start: string;
  end: string;
  categories: string[];
  sort: string;
  search?: string;
}): Promise<{ expenses: ExpenseWithCategory[] }> {
  const params = new URLSearchParams();
  params.set('offset', String(options.offset));
  params.set('limit', String(options.limit));
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);
  if (options.categories.length) params.set('categories', options.categories.join(','));
  if (options.sort) params.set('sort', options.sort);
  if (options.search) params.set('search', options.search);

  const data = await request<{ expenses: ExpenseWithCategory[] }>(
    `/spendtrack/api/expenses?${params.toString()}`
  );
  return { expenses: data.expenses ?? [] };
}

export async function exportExpensesCsv(options: {
  start: string;
  end: string;
  categories: string[];
}): Promise<string> {
  const params = new URLSearchParams();
  if (options.start) params.set('start', options.start);
  if (options.end) params.set('end', options.end);
  if (options.categories.length) params.set('categories', options.categories.join(','));

  const data = await request<{ content: string }>(`/spendtrack/api/export?${params.toString()}`);
  return data.content ?? '';
}

export async function importExpensesCsv(content: string): Promise<ImportResult> {
  try {
    const data = await request<{ imported: number; skipped: number; errors: ImportError[] }>(
      '/spendtrack/api/import',
      { method: 'POST', body: JSON.stringify({ content }) }
    );
    return { success: true, imported: data.imported, skipped: data.skipped, errors: data.errors };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل استيراد المصروفات' };
  }
}

type ImportError = { row: number; message: string };

type ImportResult =
  { success: true; imported: number; skipped: number; errors: ImportError[] } | { error: string };

export async function getCurrency(): Promise<string | null> {
  try {
    const data = await request<{ currency: string }>('/spendtrack/api/settings/currency');
    return data?.currency ?? null;
  } catch {
    return null;
  }
}

export async function setCurrency(currency: string): Promise<ActionState> {
  try {
    await request('/spendtrack/api/settings/currency', {
      method: 'PUT',
      body: JSON.stringify({ currency }),
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل حفظ العملة' };
  }
}
