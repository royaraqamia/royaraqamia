import type { SpendtrackRepository } from '@/backend/repositories/spendtrack/spendtrack-repository';
import type {
  Category,
  CategoryBudget,
  SpendtrackTransactionsQuery,
  SpendtrackTransactionsResult,
} from '@/shared/contracts/spendtrack';

export interface SpendtrackCategoryInput {
  name: string;
  colorHex: string;
}

export interface SpendtrackExpenseInput {
  amount: number;
  category_id: string;
  date: string;
  description: string | null;
}

export interface ExpenseAlertInfo {
  userId: string;
  month: string;
  categoryId: string;
}

export class SpendtrackService {
  constructor(
    private readonly repository: SpendtrackRepository,
    private readonly onExpenseAlert?: (info: ExpenseAlertInfo) => void
  ) {}

  async getUserCategories(userId: string): Promise<Category[]> {
    return this.repository.getUserCategories(userId);
  }

  async getTotalExpenses(
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<number | null> {
    return this.repository.getTotalExpenses(userId, start, end, catFilter);
  }

  async getCategoryBreakdown(
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<{ categoryId: string; colorHex: string; name: string; total: number }[] | null> {
    return this.repository.getCategoryBreakdown(userId, start, end, catFilter);
  }

  async getDailyTotals(
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<{ date: string; total: number }[] | null> {
    return this.repository.getDailyTotals(userId, start, end, catFilter);
  }

  async getTransactions(query: SpendtrackTransactionsQuery): Promise<SpendtrackTransactionsResult> {
    return this.repository.getTransactions(query);
  }

  async createExpense(userId: string, input: SpendtrackExpenseInput): Promise<void> {
    if (isNaN(input.amount) || input.amount <= 0) {
      throw new Error('مبلغ غير صالح');
    }
    if (!input.category_id) {
      throw new Error('التصنيف مطلوب');
    }
    if (!input.date) {
      throw new Error('التاريخ مطلوب');
    }

    await this.repository.createExpense({ user_id: userId, ...input });

    const month = input.date.slice(0, 7);
    this.onExpenseAlert?.({ userId, month, categoryId: input.category_id });
  }

  async getBudget(
    userId: string,
    month: string,
    categoryId?: string | null
  ): Promise<number | null> {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('شهر غير صالح');
    }
    return this.repository.getBudget(userId, month, categoryId);
  }

  async setBudget(
    userId: string,
    month: string,
    amount: number,
    categoryId?: string | null
  ): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('شهر غير صالح');
    }
    if (isNaN(amount) || amount <= 0) {
      throw new Error('مبلغ غير صالح');
    }
    await this.repository.setBudget(userId, month, amount, categoryId);
  }

  async deleteBudget(userId: string, month: string, categoryId?: string | null): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error('شهر غير صالح');
    }
    await this.repository.deleteBudget(userId, month, categoryId);
  }

  async getCategoryBudgets(
    userId: string,
    month: string,
    categories: { id: string; name: string; colorHex: string }[]
  ): Promise<CategoryBudget[]> {
    const rows = await this.repository.getBudgets(userId, month);
    const byId = new Map<string, number>();
    for (const row of rows) {
      if (row.category_id) byId.set(row.category_id, row.amount);
    }
    return categories
      .map((cat) => ({
        categoryId: cat.id,
        name: cat.name,
        colorHex: cat.colorHex,
        budget: byId.get(cat.id) ?? null,
      }))
      .sort((a, b) => {
        if (a.budget === null && b.budget === null) return a.name.localeCompare(b.name);
        if (a.budget === null) return 1;
        if (b.budget === null) return -1;
        return b.budget - a.budget;
      });
  }

  async updateExpense(
    expenseId: string,
    userId: string,
    input: SpendtrackExpenseInput
  ): Promise<void> {
    if (isNaN(input.amount) || input.amount <= 0) {
      throw new Error('مبلغ غير صالح');
    }

    await this.repository.updateExpense(expenseId, userId, input);
  }

  async deleteExpense(expenseId: string, userId: string): Promise<void> {
    await this.repository.deleteExpense(expenseId, userId);
  }

  async createCategory(userId: string, input: SpendtrackCategoryInput): Promise<void> {
    this.validateCategoryInput(input);
    await this.repository.createCategory({ user_id: userId, ...input, name: input.name.trim() });
  }

  async updateCategory(
    categoryId: string,
    userId: string,
    input: SpendtrackCategoryInput
  ): Promise<void> {
    this.validateCategoryInput(input);
    await this.repository.updateCategory(categoryId, userId, {
      ...input,
      name: input.name.trim(),
    });
  }

  async deleteCategory(categoryId: string, userId: string): Promise<void> {
    await this.repository.deleteCategory(categoryId, userId);
  }

  private validateCategoryInput(input: SpendtrackCategoryInput): void {
    const name = input.name.trim();
    if (!name || name.length > 50) {
      throw new Error('الاسم مطلوب ويجب أن يكون أقل من 50 حرفًا');
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(input.colorHex)) {
      throw new Error('اللون غير صالح');
    }
  }
}
