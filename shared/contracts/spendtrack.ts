import { z } from 'zod';

/**
 * The sync route's read model, as a schema (#653).
 *
 * The interfaces below are TypeScript, which the Kotlin generator cannot see: a
 * body the site accepts and the app cannot decode is a screen that paints
 * nothing. The app reads the same route the web's pull reads
 * (`/spendtrack/api/sync`, `frontend/api/spendtrack/local-store.ts`), so the
 * shape it decodes is written down here and regenerated into Kotlin.
 *
 * Every row carries the Outbox fields (ADR-0029) because the route is
 * tombstone-inclusive: a delete made on another device arrives as a tombstone,
 * and a pull that dropped it would re-create the row.
 */
export const SpendtrackCategorySchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  name: z.string(),
  colorHex: z.string(),
  created_at: z.string(),
  clientId: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
});

/** One split as the snapshot carries it: part of an expense, drawn by the web only today. */
export const SpendtrackExpenseSplitSchema = z.object({
  id: z.string(),
  expense_id: z.string(),
  category_id: z.string(),
  amount: z.number(),
  clientId: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
});

/** One expense as the snapshot carries it, with the category it was filed under. */
export const SpendtrackExpenseSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  category_id: z.string(),
  amount: z.number(),
  description: z.string().nullable(),
  date: z.string(),
  created_at: z.string(),
  currency: z.string().nullable().optional(),
  categories: z
    .object({
      name: z.string(),
      colorHex: z.string(),
    })
    .nullable()
    .optional(),
  splits: z.array(SpendtrackExpenseSplitSchema).nullable().optional(),
  clientId: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
});

/** One month's budget, owned or category-scoped. */
export const SpendtrackBudgetSchema = z.object({
  id: z.string(),
  month: z.string(),
  amount: z.number(),
  category_id: z.string().nullable(),
  clientId: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
});

/** One recurring expense as the snapshot carries it. */
export const SpendtrackRecurringSchema = z.object({
  id: z.string(),
  amount: z.number(),
  category_id: z.string(),
  description: z.string().nullable(),
  day_of_month: z.number().int(),
  start_month: z.string(),
  active: z.boolean(),
  clientId: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
});

/**
 * `GET /spendtrack/api/sync` (#653): the owned set, tombstones included, plus
 * the cursor the next page passes as `since`.
 */
export const SpendtrackSyncSnapshotSchema = z.object({
  categories: z.array(SpendtrackCategorySchema),
  expenses: z.array(SpendtrackExpenseSchema),
  budgets: z.array(SpendtrackBudgetSchema),
  recurring: z.array(SpendtrackRecurringSchema),
  cursor: z.string().nullable(),
});

/**
 * What a queued write sends (#653).
 *
 * The web's outbox builds these bodies by hand
 * (`frontend/api/spendtrack/local-store.ts`); the app builds them from a
 * generated type, so a field the server stops accepting is a compile error in
 * the app rather than a queued write that can never drain.
 */

/** One split as a write carries it: part of an expense, drawn by the web only today. */
export const SpendtrackSplitWriteSchema = z.object({
  category_id: z.string(),
  amount: z.number(),
  clientId: z.string().nullable().optional(),
});

/** A queued expense create: the row's body, with the splits it carries. */
export const SpendtrackExpenseWriteSchema = z.object({
  clientId: z.string(),
  amount: z.number(),
  category_id: z.string(),
  date: z.string(),
  description: z.string().nullable(),
  currency: z.string().nullable(),
  splits: z.array(SpendtrackSplitWriteSchema),
  updatedAt: z.string(),
});

/** A change to an owned expense: the write above, its id, and any tombstone decision. */
export const SpendtrackExpenseUpdateSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  amount: z.number(),
  category_id: z.string(),
  date: z.string(),
  description: z.string().nullable(),
  currency: z.string().nullable(),
  splits: z.array(SpendtrackSplitWriteSchema),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** A new category: the id travels as `clientId`, which is what makes a replay an upsert. */
export const SpendtrackCategoryWriteSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  color_hex: z.string(),
  updatedAt: z.string(),
});

/** A change to an owned category. */
export const SpendtrackCategoryUpdateSchema = z.object({
  id: z.string(),
  name: z.string(),
  color_hex: z.string(),
  updatedAt: z.string(),
});

/** A queued delete: the row's id and the instant the delete was decided. */
export const SpendtrackDeleteSchema = z.object({
  id: z.string(),
  updatedAt: z.string(),
});

/**
 * `GET /spendtrack/api/settings/currency` (#653): the account's display currency,
 * which is what turns a stored amount into the figure the site writes.
 */
export const SpendtrackCurrencySchema = z.object({
  currency: z.string(),
});

/**
 * A month's budget (#653). The server keys it on `(user_id, month, category_id)`
 * rather than on a client-minted id, which is why no `clientId` travels: the web
 * drops it for the same reason (`sync-transport.ts`).
 */
export const SpendtrackBudgetWriteSchema = z.object({
  month: z.string(),
  amount: z.number(),
  categoryId: z.string().nullable(),
  updatedAt: z.string(),
});

/** A budget removal: the pair it was keyed on, and the instant it was decided. */
export const SpendtrackBudgetDeleteSchema = z.object({
  month: z.string(),
  categoryId: z.string().nullable(),
  updatedAt: z.string(),
});

/** A new recurring expense: the client-minted id, which makes a replay an upsert. */
export const SpendtrackRecurringWriteSchema = z.object({
  clientId: z.string(),
  amount: z.number(),
  category_id: z.string(),
  description: z.string().nullable(),
  day_of_month: z.number().int(),
  start_month: z.string(),
  updatedAt: z.string(),
});

/** One row a CSV import could not take, with the reason. */
export const SpendtrackImportErrorSchema = z.object({
  row: z.number().int(),
  message: z.string(),
});

/**
 * `POST /spendtrack/api/import` (#653): what an import took, what it skipped,
 * and why — the same answer the site's dialog reads its toast from.
 */
export const SpendtrackImportResultSchema = z.object({
  imported: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(SpendtrackImportErrorSchema),
});

/** A change to an owned recurring expense. */
export const SpendtrackRecurringUpdateSchema = z.object({
  id: z.string(),
  amount: z.number(),
  category_id: z.string(),
  description: z.string().nullable(),
  day_of_month: z.number().int(),
  start_month: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});

/** Outbox/LWW fields shared by offline-owned rows (ADR-0029, ticket #162). */
type OfflineFields = {
  clientId?: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
};

export type Category = OfflineFields & {
  id: string;
  user_id: string | null;
  name: string;
  colorHex: string;
  created_at: string;
};

export type ExpenseSplit = OfflineFields & {
  id: string;
  expense_id: string;
  category_id: string;
  amount: number;
};

export type ExpenseSplitInput = {
  category_id: string;
  amount: number;
};

export type Expense = OfflineFields & {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  description: string | null;
  date: string;
  created_at: string;
  updated_at: string;
  currency?: string | null;
  splits?: ExpenseSplit[];
  categories?: Pick<Category, 'name' | 'colorHex'>;
};

export type ExpenseWithCategory = Expense & {
  categories?: Pick<Category, 'name' | 'colorHex'>;
};

export interface SpendtrackTransactionsQuery {
  userId: string;
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
  pageSize: number;
  offset?: number;
  search?: string;
}

export interface SpendtrackTransactionsResult {
  expenses: ExpenseWithCategory[];
  categories: Category[];
  totalCount: number;
}

/**
 * The full owned SpendTrack dataset for reconciliation (ADR-0028): every row
 * the device may own, **including tombstones** (`deletedAt` set), so a delete
 * made on another device reaches this one. Deliberately uncapped — the local
 * store is authoritative, so it must be able to hold the whole set.
 */
export interface SpendtrackSyncSnapshot {
  categories: Category[];
  expenses: ExpenseWithCategory[];
  budgets: Budget[];
  recurring: RecurringExpense[];
  /**
   * Opaque cursor (`server_updated_at`) to pass as `since` on the next sync.
   * The server advances it to the newest row returned, so the next page only
   * carries rows the server has touched since. `null` before the first sync.
   */
  cursor: string | null;
}

export type Budget = OfflineFields & {
  id: string;
  month: string;
  amount: number;
  category_id: string | null;
};

export type CategoryBudget = {
  categoryId: string;
  name: string;
  colorHex: string;
  budget: number | null;
};

export type RecurringExpense = OfflineFields & {
  id: string;
  amount: number;
  category_id: string;
  description: string | null;
  day_of_month: number;
  start_month: string;
  active: boolean;
};

export type RecurringExpenseInput = {
  amount: number;
  category_id: string;
  description: string | null;
  day_of_month: number;
  start_month: string;
};

export type SpendInsights = {
  topCategory: { name: string; colorHex: string; total: number } | null;
  topCategoryShare: number;
  avgPerDay: number;
  prevPeriodTotal: number | null;
  deltaPct: number | null;
};

export type SpendImportRow = {
  date: string;
  amount: number;
  category: string;
  description: string;
};

export type SpendImportResult = {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
};
