import { describe, it, expect, vi } from 'vitest';
import {
  SpendtrackService,
  type SpendtrackExpenseInput,
} from '@/backend/services/spendtrack/spendtrack-service';
import type { SpendtrackRepository } from '@/backend/repositories/spendtrack/spendtrack-repository';

function makeRepo(overrides: Partial<SpendtrackRepository> = {}) {
  const repository: SpendtrackRepository = {
    getUserCategories: vi.fn(),
    getTotalExpenses: vi.fn(),
    getCategoryBreakdown: vi.fn(),
    getDailyTotals: vi.fn(),
    getTransactions: vi.fn(),
    getAllExpenses: vi.fn(),
    createExpense: vi.fn(),
    createExpensesMany: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    getBudget: vi.fn(),
    setBudget: vi.fn(),
    getBudgets: vi.fn(),
    deleteBudget: vi.fn(),
    getRecurringExpenses: vi.fn(),
    createRecurringExpense: vi.fn(),
    updateRecurringExpense: vi.fn(),
    deleteRecurringExpense: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    getUserCurrency: vi.fn(),
    setUserCurrency: vi.fn(),
    ...overrides,
  };
  return { repository };
}

function makeService(
  repository: SpendtrackRepository,
  onExpenseAlert?: (info: { userId: string; month: string; categoryId: string }) => void
) {
  return new SpendtrackService(repository, onExpenseAlert);
}

const expenseInput: SpendtrackExpenseInput = {
  amount: 50,
  category_id: 'c-1',
  date: '2026-08-15',
  description: 'غداء',
};

describe('SpendtrackService budget', () => {
  it('delegates getBudget', async () => {
    const { repository } = makeRepo();
    (repository.getBudget as ReturnType<typeof vi.fn>).mockResolvedValue(1200.5);
    const service = makeService(repository);

    await expect(service.getBudget('u-1', '2026-08')).resolves.toBe(1200.5);
    expect(repository.getBudget).toHaveBeenCalledWith('u-1', '2026-08', undefined);
  });

  it('rejects an invalid month in getBudget', async () => {
    const { repository } = makeRepo();
    const service = makeService(repository);

    await expect(service.getBudget('u-1', 'august-2026')).rejects.toThrow('شهر غير صالح');
    expect(repository.getBudget).not.toHaveBeenCalled();
  });

  it('delegates setBudget and validates amount', async () => {
    const { repository } = makeRepo();
    (repository.setBudget as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const service = makeService(repository);

    await service.setBudget('u-1', '2026-08', 1500);
    expect(repository.setBudget).toHaveBeenCalledWith('u-1', '2026-08', 1500, undefined);

    await expect(service.setBudget('u-1', '2026-08', -5)).rejects.toThrow('مبلغ غير صالح');
    await expect(service.setBudget('u-1', 'bad-month', 10)).rejects.toThrow('شهر غير صالح');
  });

  it('forwards a category id to setBudget and getBudget', async () => {
    const { repository } = makeRepo();
    (repository.setBudget as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const service = makeService(repository);

    await service.setBudget('u-1', '2026-08', 500, 'cat-9');
    expect(repository.setBudget).toHaveBeenCalledWith('u-1', '2026-08', 500, 'cat-9');

    (repository.getBudget as ReturnType<typeof vi.fn>).mockResolvedValue(500);
    await expect(service.getBudget('u-1', '2026-08', 'cat-9')).resolves.toBe(500);
    expect(repository.getBudget).toHaveBeenCalledWith('u-1', '2026-08', 'cat-9');
  });

  it('maps category budgets from repository rows', async () => {
    const { repository } = makeRepo();
    (repository.getBudgets as ReturnType<typeof vi.fn>).mockResolvedValue([
      { category_id: 'cat-1', amount: 500 },
      { category_id: null, amount: 1500 },
    ]);
    const service = makeService(repository);

    const result = await service.getCategoryBudgets('u-1', '2026-08', [
      { id: 'cat-1', name: 'طعام', colorHex: '#000000' },
      { id: 'cat-2', name: 'مواصلات', colorHex: '#ffffff' },
    ]);

    expect(result).toEqual([
      { categoryId: 'cat-1', name: 'طعام', colorHex: '#000000', budget: 500 },
      { categoryId: 'cat-2', name: 'مواصلات', colorHex: '#ffffff', budget: null },
    ]);
  });
});

describe('SpendtrackService recurring expenses', () => {
  it('validates the recurring input before creating', async () => {
    const { repository } = makeRepo();
    (repository.createRecurringExpense as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'r-1',
      amount: 90,
      category_id: 'c-1',
      description: 'فاتورة',
      day_of_month: 5,
      start_month: '2026-08',
      active: true,
    });
    const service = makeService(repository);

    const created = await service.createRecurringExpense('u-1', {
      amount: 90,
      category_id: 'c-1',
      description: 'فاتورة',
      day_of_month: 5,
      start_month: '2026-08',
    });

    expect(created.id).toBe('r-1');
    await expect(
      service.createRecurringExpense('u-1', {
        amount: -3,
        category_id: 'c-1',
        description: null,
        day_of_month: 5,
        start_month: '2026-08',
      })
    ).rejects.toThrow('مبلغ غير صالح');
    await expect(
      service.createRecurringExpense('u-1', {
        amount: 10,
        category_id: 'c-1',
        description: null,
        day_of_month: 35,
        start_month: '2026-08',
      })
    ).rejects.toThrow('يوم الشهر غير صالح');
    await expect(
      service.createRecurringExpense('u-1', {
        amount: 10,
        category_id: 'c-1',
        description: null,
        day_of_month: 5,
        start_month: 'bad',
      })
    ).rejects.toThrow('شهر البداية غير صالح');
  });

  it('delegates delete and list', async () => {
    const { repository } = makeRepo();
    (repository.getRecurringExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const service = makeService(repository);

    await service.getRecurringExpenses('u-1');
    await service.deleteRecurringExpense('r-1', 'u-1');

    expect(repository.getRecurringExpenses).toHaveBeenCalledWith('u-1');
    expect(repository.deleteRecurringExpense).toHaveBeenCalledWith('r-1', 'u-1');
  });
});

describe('SpendtrackService expense alert', () => {
  it('fires the alert with the expense month after creating an expense', async () => {
    const { repository } = makeRepo();
    (repository.createExpense as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const onExpenseAlert = vi.fn();
    const service = makeService(repository, onExpenseAlert);

    await service.createExpense('u-1', expenseInput);

    expect(repository.createExpense).toHaveBeenCalledWith({
      user_id: 'u-1',
      ...expenseInput,
    });
    expect(onExpenseAlert).toHaveBeenCalledWith({
      userId: 'u-1',
      month: '2026-08',
      categoryId: 'c-1',
    });
  });

  it('does not fire the alert when no callback is provided', async () => {
    const { repository } = makeRepo();
    (repository.createExpense as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const service = makeService(repository);

    await service.createExpense('u-1', expenseInput);

    expect(repository.createExpense).toHaveBeenCalled();
  });
});

describe('SpendtrackService currency settings', () => {
  it('defaults to USD when no stored currency exists', async () => {
    const { repository } = makeRepo();
    (repository.getUserCurrency as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const service = makeService(repository);

    await expect(service.getCurrency('u-1')).resolves.toBe('USD');
  });

  it('returns the stored currency when valid', async () => {
    const { repository } = makeRepo();
    (repository.getUserCurrency as ReturnType<typeof vi.fn>).mockResolvedValue('SYP');
    const service = makeService(repository);

    await expect(service.getCurrency('u-1')).resolves.toBe('SYP');
  });

  it('falls back to USD for an invalid stored currency', async () => {
    const { repository } = makeRepo();
    (repository.getUserCurrency as ReturnType<typeof vi.fn>).mockResolvedValue('XYZ');
    const service = makeService(repository);

    await expect(service.getCurrency('u-1')).resolves.toBe('USD');
  });

  it('persists a supported currency', async () => {
    const { repository } = makeRepo();
    (repository.setUserCurrency as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const service = makeService(repository);

    await service.updateCurrency('u-1', 'SAR');
    expect(repository.setUserCurrency).toHaveBeenCalledWith('u-1', 'SAR');
  });

  it('rejects an unsupported currency', async () => {
    const { repository } = makeRepo();
    const service = makeService(repository);

    await expect(service.updateCurrency('u-1', 'XYZ')).rejects.toThrow('عملة غير مدعومة');
    expect(repository.setUserCurrency).not.toHaveBeenCalled();
  });
});

describe('SpendtrackService CSV export/import', () => {
  it('exports expenses as CSV with category names', async () => {
    const { repository } = makeRepo();
    (repository.getAllExpenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'e-1',
        amount: 50.5,
        date: '2026-08-01',
        description: 'غداء',
        categories: { name: 'طعام', colorHex: '#ff0000' },
      },
    ]);
    const service = makeService(repository);

    const csv = await service.getExportCsv('u-1', '2026-08-01', '2026-08-31', null);
    expect(csv).toContain('date,amount,category,description');
    expect(csv).toContain('2026-08-01,50.5,طعام,غداء');
    expect(repository.getAllExpenses).toHaveBeenCalledWith('u-1', '2026-08-01', '2026-08-31', null);
  });

  it('imports valid rows, skipping malformed ones', async () => {
    const { repository } = makeRepo();
    (repository.getUserCategories as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'cat-1', name: 'طعام', colorHex: '#ff0000' },
    ]);
    (repository.createExpensesMany as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const service = makeService(repository);

    const content =
      'date,amount,category,description\n2026-08-01,50,طعام,غداء\nbad-date,10,طعام,x\n2026-08-02,-5,طعام,y';
    const result = await service.importExpensesCsv('u-1', content);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(2);
    expect(repository.createExpensesMany).toHaveBeenCalledWith([
      {
        user_id: 'u-1',
        amount: 50,
        category_id: 'cat-1',
        date: '2026-08-01',
        description: 'غداء',
      },
    ]);
  });

  it('creates missing categories before importing their rows', async () => {
    const { repository } = makeRepo();
    (repository.getUserCategories as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'new-1', name: 'خدمات', colorHex: '#0ea5e9' }]);
    (repository.createCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (repository.createExpensesMany as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const service = makeService(repository);

    const result = await service.importExpensesCsv('u-1', '2026-08-03,12,خدمات,فاتورة');

    expect(result.imported).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(repository.createCategory).toHaveBeenCalledWith({
      user_id: 'u-1',
      name: 'خدمات',
      colorHex: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });
    expect(repository.createExpensesMany).toHaveBeenCalledWith([
      {
        user_id: 'u-1',
        amount: 12,
        category_id: 'new-1',
        date: '2026-08-03',
        description: 'فاتورة',
      },
    ]);
  });
});
