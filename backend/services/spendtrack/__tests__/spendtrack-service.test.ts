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
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    getBudget: vi.fn(),
    setBudget: vi.fn(),
    getBudgets: vi.fn(),
    deleteBudget: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
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
