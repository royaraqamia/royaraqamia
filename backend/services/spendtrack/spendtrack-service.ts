import type { SpendtrackRepository } from '@/backend/repositories/spendtrack/spendtrack-repository';
import { DEFAULT_CURRENCY, isSupportedCurrency, type CurrencyCode } from '@/shared/currency';
import type {
  Category,
  CategoryBudget,
  RecurringExpense,
  RecurringExpenseInput,
  SpendImportResult,
  SpendInsights,
  SpendtrackTransactionsQuery,
  SpendtrackTransactionsResult,
} from '@/shared/contracts/spendtrack';
import {
  calculateInsights,
  previousPeriodRange,
} from '@/backend/services/spendtrack/spend-insights';
import {
  buildCsv,
  colorFromName,
  parseCsv,
  stripCsvHeader,
  type SpendExportRow,
} from '@/backend/services/spendtrack/spendtrack-csv';

export interface SpendtrackCategoryInput {
  name: string;
  colorHex: string;
}

export interface SpendtrackExpenseInput {
  amount: number;
  category_id: string;
  date: string;
  description: string | null;
  currency?: string | null;
  splits?: { category_id: string; amount: number }[];
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

  async getInsights(
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<SpendInsights> {
    const [total, breakdown, prevTotal] = await Promise.all([
      this.repository.getTotalExpenses(userId, start, end, catFilter),
      this.repository.getCategoryBreakdown(userId, start, end, catFilter),
      (async () => {
        const prev = previousPeriodRange(start, end);
        return this.repository.getTotalExpenses(userId, prev.start, prev.end, catFilter);
      })(),
    ]);

    return calculateInsights({
      total: total ?? 0,
      breakdown: breakdown ?? [],
      start,
      end,
      prevPeriodTotal: prevTotal,
    });
  }

  async getExportCsv(
    userId: string,
    start: string,
    end: string,
    catFilter: string[] | null
  ): Promise<string> {
    const expenses = await this.repository.getAllExpenses(userId, start, end, catFilter);
    const rows: SpendExportRow[] = expenses.map((expense) => ({
      date: expense.date,
      amount: expense.amount,
      category: expense.categories?.name ?? '',
      description: expense.description,
    }));
    return buildCsv(rows);
  }

  async importExpensesCsv(userId: string, content: string): Promise<SpendImportResult> {
    const rows = parseCsv(stripCsvHeader(content));
    const categories = await this.repository.getUserCategories(userId);
    const byName = new Map<string, string>();
    for (const category of categories) {
      byName.set(category.name.trim().toLowerCase(), category.id);
    }

    const errors: SpendImportResult['errors'] = [];
    const validRows: {
      amount: number;
      category_id: string;
      date: string;
      description: string | null;
    }[] = [];
    const toCreateNames = new Set<string>();

    rows.forEach((row, index) => {
      const rowNumber = index + 1;
      let error: string | null = null;
      if (!row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) error = 'تاريخ غير صالح';
      else if (isNaN(row.amount) || row.amount <= 0) error = 'مبلغ غير صالح';
      else if (!row.category.trim()) error = 'التصنيف مطلوب';
      if (error) {
        errors.push({ row: rowNumber, message: error });
        return;
      }
      const name = row.category.trim();
      let categoryId = byName.get(name.toLowerCase());
      if (!categoryId) {
        toCreateNames.add(name);
        categoryId = `pending:${name.toLowerCase()}`;
      }
      validRows.push({
        amount: row.amount,
        category_id: categoryId,
        date: row.date,
        description: row.description && row.description.trim() ? row.description.trim() : null,
      });
    });

    if (toCreateNames.size > 0) {
      for (const name of toCreateNames) {
        await this.repository.createCategory({
          user_id: userId,
          name,
          colorHex: colorFromName(name),
        });
      }
      const refreshed = await this.repository.getUserCategories(userId);
      for (const category of refreshed) {
        byName.set(category.name.trim().toLowerCase(), category.id);
      }
      for (const insert of validRows) {
        if (insert.category_id.startsWith('pending:')) {
          const resolved = byName.get(insert.category_id.slice('pending:'.length));
          if (resolved) insert.category_id = resolved;
        }
      }
    }

    const rowsToInsert = validRows.filter((insert) => !insert.category_id.startsWith('pending:'));
    const imported = rowsToInsert.length;
    const skipped = rows.length - imported - errors.length;
    await this.repository.createExpensesMany(
      rowsToInsert.map((insert) => ({ user_id: userId, ...insert }))
    );

    return { imported, skipped, errors };
  }

  async getTransactions(query: SpendtrackTransactionsQuery): Promise<SpendtrackTransactionsResult> {
    return this.repository.getTransactions(query);
  }

  private async validateExpenseInput(input: SpendtrackExpenseInput, userId: string): Promise<void> {
    if (isNaN(input.amount) || input.amount <= 0) {
      throw new Error('مبلغ غير صالح');
    }
    if (!input.category_id) {
      throw new Error('التصنيف مطلوب');
    }
    if (!input.date) {
      throw new Error('التاريخ مطلوب');
    }

    const currency = input.currency ?? null;
    if (currency !== null && !isSupportedCurrency(currency)) {
      throw new Error('عملة غير مدعومة');
    }

    const splits = input.splits ?? [];
    if (splits.length > 0) {
      const seen = new Set<string>();
      let sum = 0;
      for (const split of splits) {
        if (!split.category_id) throw new Error('التصنيف مطلوب في التقسيم');
        if (isNaN(split.amount) || split.amount <= 0) throw new Error('مبلغ التقسيم غير صالح');
        if (seen.has(split.category_id)) throw new Error('لا يمكن تكرار التصنيف في التقسيم');
        seen.add(split.category_id);
        sum += split.amount;
      }
      if (Math.abs(sum - input.amount) > 0.01) {
        throw new Error('مجموع التقسيمات يجب أن يساوي المبلغ الإجمالي');
      }
      const allowed = await this.repository.getUserCategories(userId);
      const allowedIds = new Set(allowed.map((category) => category.id));
      for (const split of splits) {
        if (!allowedIds.has(split.category_id)) throw new Error('تصنيف غير مسموح في التقسيم');
      }
    }
  }

  async createExpense(userId: string, input: SpendtrackExpenseInput): Promise<void> {
    await this.validateExpenseInput(input, userId);

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
    await this.validateExpenseInput(input, userId);

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

  async getRecurringExpenses(userId: string): Promise<RecurringExpense[]> {
    return this.repository.getRecurringExpenses(userId);
  }

  async createRecurringExpense(
    userId: string,
    input: RecurringExpenseInput
  ): Promise<RecurringExpense> {
    this.validateRecurringInput(input);
    return this.repository.createRecurringExpense(userId, input);
  }

  async updateRecurringExpense(
    expenseId: string,
    userId: string,
    input: RecurringExpenseInput
  ): Promise<void> {
    this.validateRecurringInput(input);
    await this.repository.updateRecurringExpense(expenseId, userId, input);
  }

  async deleteRecurringExpense(expenseId: string, userId: string): Promise<void> {
    await this.repository.deleteRecurringExpense(expenseId, userId);
  }

  async getCurrency(userId: string): Promise<CurrencyCode> {
    const stored = await this.repository.getUserCurrency(userId);
    return stored && isSupportedCurrency(stored) ? stored : DEFAULT_CURRENCY;
  }

  async updateCurrency(userId: string, code: string): Promise<void> {
    if (!isSupportedCurrency(code)) {
      throw new Error('عملة غير مدعومة');
    }
    await this.repository.setUserCurrency(userId, code);
  }

  private validateRecurringInput(input: RecurringExpenseInput): void {
    if (isNaN(input.amount) || input.amount <= 0) {
      throw new Error('مبلغ غير صالح');
    }
    if (!input.category_id) {
      throw new Error('التصنيف مطلوب');
    }
    if (
      !Number.isInteger(input.day_of_month) ||
      input.day_of_month < 1 ||
      input.day_of_month > 31
    ) {
      throw new Error('يوم الشهر غير صالح');
    }
    if (!/^\d{4}-\d{2}$/.test(input.start_month)) {
      throw new Error('شهر البداية غير صالح');
    }
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
