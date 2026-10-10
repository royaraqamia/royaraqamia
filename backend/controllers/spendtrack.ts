import { createSpendtrackService } from '@/backend/config/spendtrack';
import {
  jsonResult,
  type HttpResult,
  type RevalidationHint,
} from '@/backend/transport/http-result';
import { messageError } from '@/backend/transport/authenticated-handler';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import type {
  SpendtrackCategoryInput,
  SpendtrackCategoryUpdateInput,
  SpendtrackExpenseInput,
} from '@/backend/services/spendtrack/spendtrack-service';
import type { RecurringExpenseInput } from '@/shared/contracts/spendtrack';

const SPENDTRACK_LAYOUT_REVALIDATION: RevalidationHint[] = [
  { path: '/spendtrack', type: 'layout' },
];

/** Offline write metadata an Outbox replay carries (ADR-0029, ticket #162). */
function offlineWriteFields(body: Record<string, unknown>): {
  clientId?: string;
  updatedAt?: string;
} {
  const clientId =
    body.clientId === undefined || body.clientId === null ? undefined : String(body.clientId);
  const updatedAt = typeof body.updatedAt === 'string' ? body.updatedAt : undefined;
  return { clientId, updatedAt };
}

/** `deletedAt` present means the write carries a tombstone decision (null = resurrect). */
function offlineDeleteField(body: Record<string, unknown>): { deletedAt?: string | null } {
  if (!('deletedAt' in body)) return {};
  return { deletedAt: body.deletedAt === null ? null : String(body.deletedAt) };
}

/** The `updatedAt` a delete replay carries so the tombstone keeps write order. */
function offlineDeleteMeta(body: Record<string, unknown>): { updatedAt?: string } {
  return typeof body.updatedAt === 'string' ? { updatedAt: body.updatedAt } : {};
}

export async function getExpenses(query: URLSearchParams): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const offset = Number(query.get('offset') ?? 0);
      const limit = Number(query.get('limit') ?? 20);
      const start = query.get('start') ?? '';
      const end = query.get('end') ?? '';
      const categories = (query.get('categories') ?? '').split(',').filter(Boolean);
      const sort = query.get('sort') ?? '';
      const search = query.get('search') ?? undefined;

      const { expenses } = await createSpendtrackService(supabase).getTransactions({
        userId,
        start,
        end,
        filterCategories: categories,
        sort,
        pageSize: limit,
        offset,
        search,
      });

      return jsonResult(200, { expenses });
    },
    { mapError: messageError(500, 'فشل تحميل المصروفات') }
  );
}

export async function exportExpenses(query: URLSearchParams): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const start = query.get('start') ?? '';
      const end = query.get('end') ?? '';
      const categories = (query.get('categories') ?? '').split(',').filter(Boolean);
      const catFilter: string[] | null = categories.length > 0 ? categories : null;

      const content = await createSpendtrackService(supabase).getExportCsv(
        userId,
        start,
        end,
        catFilter
      );

      return jsonResult(200, { content });
    },
    { mapError: messageError(500, 'فشل تصدير المصروفات') }
  );
}

export async function importExpenses(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const content = String(body.content ?? '');
      if (!content.trim()) {
        return jsonResult(400, { error: 'لا يوجد محتوى للاستيراد' });
      }

      const result = await createSpendtrackService(supabase).importExpensesCsv(userId, content);
      return jsonResult(200, result, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
    },
    { mapError: messageError(500, 'فشل استيراد المصروفات') }
  );
}

export async function createExpense(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { amount, category_id, date, description, currency, splits } = body;

      await createSpendtrackService(supabase).createExpense(userId, {
        amount: amount as SpendtrackExpenseInput['amount'],
        category_id: category_id as SpendtrackExpenseInput['category_id'],
        date: date as SpendtrackExpenseInput['date'],
        description: (description ?? null) as SpendtrackExpenseInput['description'],
        currency: (currency ?? null) as SpendtrackExpenseInput['currency'],
        splits: splits as SpendtrackExpenseInput['splits'],
        ...offlineWriteFields(body),
      });

      return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
    },
    { mapError: messageError(400, 'فشل إنشاء المصروف') }
  );
}

export async function updateExpense(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { amount, category_id, date, description, currency, splits } = body;

      await createSpendtrackService(supabase).updateExpense(id, userId, {
        amount: amount as SpendtrackExpenseInput['amount'],
        category_id: category_id as SpendtrackExpenseInput['category_id'],
        date: date as SpendtrackExpenseInput['date'],
        description: (description ?? null) as SpendtrackExpenseInput['description'],
        currency: (currency ?? null) as SpendtrackExpenseInput['currency'],
        splits: (splits ?? null) as SpendtrackExpenseInput['splits'],
        ...offlineWriteFields(body),
        ...offlineDeleteField(body),
      });

      return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
    },
    { mapError: messageError(400, 'فشل تحديث المصروف') }
  );
}

export async function deleteExpense(
  id: string,
  body: Record<string, unknown> = {}
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      await createSpendtrackService(supabase).deleteExpense(id, userId, offlineDeleteMeta(body));
      return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
    },
    { mapError: messageError(400, 'فشل حذف المصروف') }
  );
}

export async function getBudget(month: string, categoryId?: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const budget = await createSpendtrackService(supabase).getBudget(userId, month, categoryId);
      return jsonResult(200, { budget });
    },
    { mapError: messageError(500, 'فشل تحميل الميزانية') }
  );
}

export async function setBudget(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const month = String(body.month ?? '');
      const amount = Number(body.amount);
      const categoryId =
        body.categoryId === undefined || body.categoryId === null
          ? undefined
          : String(body.categoryId);

      await createSpendtrackService(supabase).setBudget(
        userId,
        month,
        amount,
        categoryId,
        offlineWriteFields(body)
      );
      return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
    },
    { mapError: messageError(400, 'فشل حفظ الميزانية') }
  );
}

export async function deleteBudget(
  month: string,
  categoryId?: string,
  body: Record<string, unknown> = {}
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      await createSpendtrackService(supabase).deleteBudget(
        userId,
        month,
        categoryId,
        offlineDeleteMeta(body)
      );
      return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
    },
    { mapError: messageError(400, 'فشل حذف الميزانية') }
  );
}

function parseRecurringInput(body: Record<string, unknown>) {
  return {
    amount: Number(body.amount),
    category_id: String(body.category_id ?? ''),
    description: (body.description ?? null) as string | null,
    day_of_month: Number(body.day_of_month),
    start_month: String(body.start_month ?? ''),
    ...offlineWriteFields(body),
    ...offlineDeleteField(body),
  } satisfies RecurringExpenseInput & {
    clientId?: string;
    updatedAt?: string;
    deletedAt?: string | null;
  };
}

export async function getRecurringExpenses(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const recurring = await createSpendtrackService(supabase).getRecurringExpenses(userId);
      return jsonResult(200, { recurring });
    },
    { mapError: messageError(500, 'فشل تحميل المصروفات المتكررة') }
  );
}

export async function createRecurringExpense(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const created = await createSpendtrackService(supabase).createRecurringExpense(
        userId,
        parseRecurringInput(body)
      );
      return jsonResult(
        200,
        { success: true, recurring: created },
        { revalidate: SPENDTRACK_LAYOUT_REVALIDATION }
      );
    },
    { mapError: messageError(400, 'فشل إنشاء المصروف المتكرر') }
  );
}

export async function updateRecurringExpense(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      await createSpendtrackService(supabase).updateRecurringExpense(
        id,
        userId,
        parseRecurringInput(body)
      );
      return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
    },
    { mapError: messageError(400, 'فشل تحديث المصروف المتكرر') }
  );
}

export async function deleteRecurringExpense(
  id: string,
  body: Record<string, unknown> = {}
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      await createSpendtrackService(supabase).deleteRecurringExpense(
        id,
        userId,
        offlineDeleteMeta(body)
      );
      return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
    },
    { mapError: messageError(400, 'فشل حذف المصروف المتكرر') }
  );
}

export async function createCategory(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const name = String(body.name ?? '').trim();
      const colorHex = String(body.color_hex ?? '').trim();

      await createSpendtrackService(supabase).createCategory(userId, {
        name,
        colorHex,
        ...offlineWriteFields(body),
      } satisfies SpendtrackCategoryInput);

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
    },
    { mapError: messageError(500, 'فشل إنشاء التصنيف') }
  );
}

export async function updateCategory(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const name = String(body.name ?? '').trim();
      const colorHex = String(body.color_hex ?? '').trim();

      await createSpendtrackService(supabase).updateCategory(id, userId, {
        name,
        colorHex,
        ...offlineWriteFields(body),
        ...offlineDeleteField(body),
      } satisfies SpendtrackCategoryUpdateInput);

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
    },
    { mapError: messageError(500, 'فشل تحديث التصنيف') }
  );
}

export async function deleteCategory(
  id: string,
  body: Record<string, unknown> = {}
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      await createSpendtrackService(supabase).deleteCategory(id, userId, offlineDeleteMeta(body));

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
    },
    { mapError: messageError(500, 'فشل حذف التصنيف') }
  );
}

export async function getCurrency(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const currency = await createSpendtrackService(supabase).getCurrency(userId);
      return jsonResult(200, { currency });
    },
    { mapError: messageError(500, 'فشل تحميل العملة') }
  );
}

export async function updateCurrency(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const code = String(body.currency ?? '');
      await createSpendtrackService(supabase).updateCurrency(userId, code);
      return jsonResult(200, { success: true }, { revalidate: SPENDTRACK_LAYOUT_REVALIDATION });
    },
    { mapError: messageError(400, 'فشل حفظ العملة') }
  );
}
