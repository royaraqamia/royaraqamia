import type {
  Category,
  ExpenseWithCategory,
  RecurringExpense,
  RecurringExpenseInput,
  SpendtrackTransactionsQuery,
  SpendtrackTransactionsResult,
} from '@/shared/contracts/spendtrack';

/** Offline write metadata carried by an Outbox replay (ADR-0029, ticket #162). */
export interface OfflineWriteMeta {
  clientId?: string | null;
  updatedAt?: string;
}

export interface OfflineDeleteMeta {
  updatedAt?: string;
}

export interface ExpenseWriteInput {
  amount: number;
  category_id: string;
  date: string;
  description: string | null;
  currency?: string | null;
  splits?: { category_id: string; amount: number; clientId?: string | null }[];
  clientId?: string | null;
  updatedAt?: string;
}

export interface ExpenseUpdateInput {
  amount: number;
  category_id: string;
  date: string;
  description: string | null;
  currency?: string | null;
  splits?: { category_id: string; amount: number; clientId?: string | null }[] | null;
  updatedAt?: string;
  /** `null` clears a tombstone (resurrect); a timestamp tombstones the row. */
  deletedAt?: string | null;
}

export interface CategoryWriteInput {
  name: string;
  colorHex: string;
  clientId?: string | null;
  updatedAt?: string;
}

export interface CategoryUpdateInput {
  name: string;
  colorHex: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface RecurringWriteInput extends RecurringExpenseInput {
  clientId?: string | null;
  updatedAt?: string;
}

export interface RecurringUpdateInput extends RecurringExpenseInput {
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface BudgetWriteMeta {
  clientId?: string | null;
  updatedAt?: string;
}

export interface SpendtrackRepository {
  getUserCategories(userId: string): Promise<Category[]>;
  getTotalExpenses(
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<number | null>;
  getCategoryBreakdown(
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<{ categoryId: string; colorHex: string; name: string; total: number }[] | null>;
  getDailyTotals(
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<{ date: string; total: number }[] | null>;
  getTransactions(query: SpendtrackTransactionsQuery): Promise<SpendtrackTransactionsResult>;
  getAllExpenses(
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<ExpenseWithCategory[]>;
  createExpense(input: { user_id: string } & ExpenseWriteInput): Promise<string>;
  createExpensesMany(
    inputs: {
      user_id: string;
      amount: number;
      category_id: string;
      date: string;
      description: string | null;
    }[]
  ): Promise<void>;
  updateExpense(expenseId: string, userId: string, input: ExpenseUpdateInput): Promise<void>;
  deleteExpense(expenseId: string, userId: string, meta?: OfflineDeleteMeta): Promise<void>;
  getBudget(userId: string, month: string, categoryId?: string | null): Promise<number | null>;
  setBudget(
    userId: string,
    month: string,
    amount: number,
    categoryId?: string | null,
    meta?: BudgetWriteMeta
  ): Promise<void>;
  getBudgets(
    userId: string,
    month: string
  ): Promise<{ category_id: string | null; amount: number }[]>;
  deleteBudget(
    userId: string,
    month: string,
    categoryId?: string | null,
    meta?: OfflineDeleteMeta
  ): Promise<void>;
  getRecurringExpenses(userId: string): Promise<RecurringExpense[]>;
  createRecurringExpense(userId: string, input: RecurringWriteInput): Promise<RecurringExpense>;
  updateRecurringExpense(
    expenseId: string,
    userId: string,
    input: RecurringUpdateInput
  ): Promise<void>;
  deleteRecurringExpense(
    expenseId: string,
    userId: string,
    meta?: OfflineDeleteMeta
  ): Promise<void>;
  createCategory(input: { user_id: string } & CategoryWriteInput): Promise<void>;
  updateCategory(categoryId: string, userId: string, input: CategoryUpdateInput): Promise<void>;
  deleteCategory(categoryId: string, userId: string, meta?: OfflineDeleteMeta): Promise<void>;
  getUserCurrency(userId: string): Promise<string | null>;
  setUserCurrency(userId: string, currency: string): Promise<void>;
}
