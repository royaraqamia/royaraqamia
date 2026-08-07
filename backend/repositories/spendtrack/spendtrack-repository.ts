import type {
  Category,
  RecurringExpense,
  RecurringExpenseInput,
  SpendtrackTransactionsQuery,
  SpendtrackTransactionsResult,
} from '@/shared/contracts/spendtrack';

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
  createExpense(input: {
    user_id: string;
    amount: number;
    category_id: string;
    date: string;
    description: string | null;
  }): Promise<void>;
  updateExpense(
    expenseId: string,
    userId: string,
    input: {
      amount: number;
      category_id: string;
      date: string;
      description: string | null;
    }
  ): Promise<void>;
  deleteExpense(expenseId: string, userId: string): Promise<void>;
  getBudget(userId: string, month: string, categoryId?: string | null): Promise<number | null>;
  setBudget(
    userId: string,
    month: string,
    amount: number,
    categoryId?: string | null
  ): Promise<void>;
  getBudgets(
    userId: string,
    month: string
  ): Promise<{ category_id: string | null; amount: number }[]>;
  deleteBudget(userId: string, month: string, categoryId?: string | null): Promise<void>;
  getRecurringExpenses(userId: string): Promise<RecurringExpense[]>;
  createRecurringExpense(userId: string, input: RecurringExpenseInput): Promise<RecurringExpense>;
  updateRecurringExpense(
    expenseId: string,
    userId: string,
    input: RecurringExpenseInput
  ): Promise<void>;
  deleteRecurringExpense(expenseId: string, userId: string): Promise<void>;
  createCategory(input: { user_id: string; name: string; colorHex: string }): Promise<void>;
  updateCategory(
    categoryId: string,
    userId: string,
    input: { name: string; colorHex: string }
  ): Promise<void>;
  deleteCategory(categoryId: string, userId: string): Promise<void>;
  getUserCurrency(userId: string): Promise<string | null>;
  setUserCurrency(userId: string, currency: string): Promise<void>;
}
