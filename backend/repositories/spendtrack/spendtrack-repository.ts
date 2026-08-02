import type { Category, ExpenseWithCategory } from '@/shared/contracts/spendtrack';

export interface SpendtrackTransactionsQuery {
  userId: string;
  start: string;
  end: string;
  filterCategories: string[];
  sort: string;
  pageSize: number;
  offset?: number;
}

export interface SpendtrackTransactionsResult {
  expenses: ExpenseWithCategory[];
  categories: Category[];
  totalCount: number;
}

export interface ISpendtrackRepository {
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
  ): Promise<{ category_id: string; color_hex: string; name: string; total: number }[] | null>;
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
  createCategory(input: { user_id: string; name: string; color_hex: string }): Promise<void>;
  updateCategory(
    categoryId: string,
    userId: string,
    input: { name: string; color_hex: string }
  ): Promise<void>;
  deleteCategory(categoryId: string, userId: string): Promise<void>;
}
