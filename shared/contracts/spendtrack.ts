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
