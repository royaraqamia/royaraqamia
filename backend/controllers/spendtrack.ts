import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createSpendtrackService } from '@/backend/config/spendtrack';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import type {
  SpendtrackCategoryInput,
  SpendtrackExpenseInput,
} from '@/backend/services/spendtrack/spendtrack-service';

const SPENDTRACK_LAYOUT_REVALIDATION = [{ path: '/spendtrack', type: 'layout' as const }];

export async function getExpenses(query: URLSearchParams): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    const offset = Number(query.get('offset') ?? 0);
    const limit = Number(query.get('limit') ?? 20);
    const start = query.get('start') ?? '';
    const end = query.get('end') ?? '';
    const categories = (query.get('categories') ?? '').split(',').filter(Boolean);
    const sort = query.get('sort') ?? '';

    const { expenses } = await createSpendtrackService(supabase).getTransactions({
      userId: user.id,
      start,
      end,
      filterCategories: categories,
      sort,
      pageSize: limit,
      offset,
    });

    return jsonResult(200, { expenses });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل تحميل المصروفات',
    });
  }
}

export async function createExpense(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    const { amount, category_id, date, description } = body;

    try {
      await createSpendtrackService(supabase).createExpense(user.id, {
        amount: amount as SpendtrackExpenseInput['amount'],
        category_id: category_id as SpendtrackExpenseInput['category_id'],
        date: date as SpendtrackExpenseInput['date'],
        description: (description ?? null) as SpendtrackExpenseInput['description'],
      });
    } catch (error) {
      return jsonResult(400, {
        error: error instanceof Error ? error.message : 'فشل إنشاء المصروف',
      });
    }

    return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل إنشاء المصروف',
    });
  }
}

export async function updateExpense(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    const { amount, category_id, date, description } = body;

    try {
      await createSpendtrackService(supabase).updateExpense(id, user.id, {
        amount: amount as SpendtrackExpenseInput['amount'],
        category_id: category_id as SpendtrackExpenseInput['category_id'],
        date: date as SpendtrackExpenseInput['date'],
        description: (description ?? null) as SpendtrackExpenseInput['description'],
      });
    } catch (error) {
      return jsonResult(400, {
        error: error instanceof Error ? error.message : 'فشل تحديث المصروف',
      });
    }

    return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل تحديث المصروف',
    });
  }
}

export async function deleteExpense(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    try {
      await createSpendtrackService(supabase).deleteExpense(id, user.id);
    } catch (error) {
      return jsonResult(400, {
        error: error instanceof Error ? error.message : 'فشل حذف المصروف',
      });
    }

    return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل حذف المصروف',
    });
  }
}

export async function createCategory(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    const name = String(body.name ?? '').trim();
    const colorHex = String(body.color_hex ?? '').trim();

    try {
      await createSpendtrackService(supabase).createCategory(user.id, {
        name,
        colorHex,
      } satisfies SpendtrackCategoryInput);
    } catch (error) {
      return jsonResult(500, {
        error: error instanceof Error ? error.message : 'فشل إنشاء التصنيف',
      });
    }

    return jsonResult(
      200,
      { success: true },
      {
        revalidate: [
          { path: '/spendtrack/categories', type: 'layout' },
          ...SPENDTRACK_LAYOUT_REVALIDATION,
        ],
      }
    );
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل إنشاء التصنيف',
    });
  }
}

export async function updateCategory(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    const name = String(body.name ?? '').trim();
    const colorHex = String(body.color_hex ?? '').trim();

    try {
      await createSpendtrackService(supabase).updateCategory(id, user.id, {
        name,
        colorHex,
      } satisfies SpendtrackCategoryInput);
    } catch (error) {
      return jsonResult(500, {
        error: error instanceof Error ? error.message : 'فشل تحديث التصنيف',
      });
    }

    return jsonResult(
      200,
      { success: true },
      {
        revalidate: [
          { path: '/spendtrack/categories', type: 'layout' },
          ...SPENDTRACK_LAYOUT_REVALIDATION,
        ],
      }
    );
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل تحديث التصنيف',
    });
  }
}

export async function deleteCategory(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    try {
      await createSpendtrackService(supabase).deleteCategory(id, user.id);
    } catch (error) {
      return jsonResult(500, {
        error: error instanceof Error ? error.message : 'فشل حذف التصنيف',
      });
    }

    return jsonResult(
      200,
      { success: true },
      {
        revalidate: [
          { path: '/spendtrack/categories', type: 'layout' },
          ...SPENDTRACK_LAYOUT_REVALIDATION,
        ],
      }
    );
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل حذف التصنيف',
    });
  }
}
