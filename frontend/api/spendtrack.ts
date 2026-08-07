import type { ExpenseWithCategory } from '@/shared/contracts/spendtrack';
import { request } from '@/frontend/transport/http';

type ActionState = { error?: string; success?: boolean } | undefined;

type ExpenseInput = {
  amount: string;
  category_id: string;
  date: string;
  description?: string;
};

type ExpensePayload = {
  amount: number;
  category_id: string;
  date: string;
  description: string | null;
};

function toPayload(input: ExpenseInput): ExpensePayload {
  return {
    amount: Number(input.amount),
    category_id: input.category_id,
    date: input.date,
    description: input.description?.trim()?.slice(0, 200) || null,
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

export async function getBudget(month: string): Promise<number | null> {
  const params = new URLSearchParams({ month });
  const data = await request<{ budget: number | null }>(
    `/spendtrack/api/budget?${params.toString()}`
  );
  return data?.budget ?? null;
}

export async function setBudgetForMonth(month: string, amount: number): Promise<ActionState> {
  try {
    await request('/spendtrack/api/budget', {
      method: 'PUT',
      body: JSON.stringify({ month, amount }),
    });
    return { success: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل حفظ الميزانية' };
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
