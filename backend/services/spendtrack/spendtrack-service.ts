import type { SpendtrackRepository } from '@/backend/repositories/spendtrack/spendtrack-repository';
import type {
  Category,
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

export class SpendtrackService {
  constructor(private readonly repository: SpendtrackRepository) {}

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
