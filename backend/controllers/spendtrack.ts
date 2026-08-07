import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createSpendtrackService } from '@/backend/config/spendtrack';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import type {
  SpendtrackCategoryInput,
  SpendtrackExpenseInput,
} from '@/backend/services/spendtrack/spendtrack-service';
import type { RecurringExpenseInput } from '@/shared/contracts/spendtrack';

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
    const search = query.get('search') ?? undefined;

    const { expenses } = await createSpendtrackService(supabase).getTransactions({
      userId: user.id,
      start,
      end,
      filterCategories: categories,
      sort,
      pageSize: limit,
      offset,
      search,
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

export async function getBudget(month: string, categoryId?: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    const budget = await createSpendtrackService(supabase).getBudget(user.id, month, categoryId);
    return jsonResult(200, { budget });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل تحميل الميزانية',
    });
  }
}

export async function setBudget(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    const month = String(body.month ?? '');
    const amount = Number(body.amount);
    const categoryId =
      body.categoryId === undefined || body.categoryId === null
        ? undefined
        : String(body.categoryId);

    try {
      await createSpendtrackService(supabase).setBudget(user.id, month, amount, categoryId);
    } catch (error) {
      return jsonResult(400, {
        error: error instanceof Error ? error.message : 'فشل حفظ الميزانية',
      });
    }

    return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل حفظ الميزانية',
    });
  }
}

export async function deleteBudget(month: string, categoryId?: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    try {
      await createSpendtrackService(supabase).deleteBudget(user.id, month, categoryId);
    } catch (error) {
      return jsonResult(400, {
        error: error instanceof Error ? error.message : 'فشل حذف الميزانية',
      });
    }

    return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل حذف الميزانية',
    });
  }
}

function parseRecurringInput(body: Record<string, unknown>) {
  return {
    amount: Number(body.amount),
    category_id: String(body.category_id ?? ''),
    description: (body.description ?? null) as string | null,
    day_of_month: Number(body.day_of_month),
    start_month: String(body.start_month ?? ''),
  } satisfies RecurringExpenseInput;
}

export async function getRecurringExpenses(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    const recurring = await createSpendtrackService(supabase).getRecurringExpenses(user.id);
    return jsonResult(200, { recurring });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل تحميل المصروفات المتكررة',
    });
  }
}

export async function createRecurringExpense(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    try {
      const created = await createSpendtrackService(supabase).createRecurringExpense(
        user.id,
        parseRecurringInput(body)
      );
      return jsonResult(
        200,
        { success: true, recurring: created },
        {
          revalidate: SPENDTRACK_LAYOUT_REVALIDATION,
        }
      );
    } catch (error) {
      return jsonResult(400, {
        error: error instanceof Error ? error.message : 'فشل إنشاء المصروف المتكرر',
      });
    }
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل إنشاء المصروف المتكرر',
    });
  }
}

export async function updateRecurringExpense(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    try {
      await createSpendtrackService(supabase).updateRecurringExpense(
        id,
        user.id,
        parseRecurringInput(body)
      );
    } catch (error) {
      return jsonResult(400, {
        error: error instanceof Error ? error.message : 'فشل تحديث المصروف المتكرر',
      });
    }

    return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل تحديث المصروف المتكرر',
    });
  }
}

export async function deleteRecurringExpense(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }

    try {
      await createSpendtrackService(supabase).deleteRecurringExpense(id, user.id);
    } catch (error) {
      return jsonResult(400, {
        error: error instanceof Error ? error.message : 'فشل حذف المصروف المتكرر',
      });
    }

    return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل حذف المصروف المتكرر',
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

export async function getCurrency(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }
    const currency = await createSpendtrackService(supabase).getCurrency(user.id);
    return jsonResult(200, { currency });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل تحميل العملة',
    });
  }
}

export async function updateCurrency(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { error: 'غير مصرح' });
    }
    const code = String(body.currency ?? '');
    try {
      await createSpendtrackService(supabase).updateCurrency(user.id, code);
    } catch (error) {
      return jsonResult(400, {
        error: error instanceof Error ? error.message : 'فشل حفظ العملة',
      });
    }
    return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل حفظ العملة',
    });
  }
}
