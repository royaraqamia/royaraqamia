import { describe, it, expect, vi } from 'vitest';
import { SpendtrackService } from '@/backend/services/spendtrack/spendtrack-service';
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
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    ...overrides,
  };
  return { repository, service: new SpendtrackService(repository) };
}

const validExpense = {
  amount: 25.5,
  category_id: 'cat-1',
  date: '2026-08-02',
  description: 'غداء',
};

const validCategory = { name: 'طعام', colorHex: '#FF5733' };

describe('SpendtrackService', () => {
  describe('read operations (delegation)', () => {
    it('delegates getUserCategories', async () => {
      const { repository, service } = makeRepo();
      (repository.getUserCategories as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await expect(service.getUserCategories('u-1')).resolves.toEqual([]);
      expect(repository.getUserCategories).toHaveBeenCalledWith('u-1');
    });

    it('delegates getTotalExpenses', async () => {
      const { repository, service } = makeRepo();
      (repository.getTotalExpenses as ReturnType<typeof vi.fn>).mockResolvedValue(100);
      await expect(service.getTotalExpenses('u-1', '2026-08-01', '2026-08-02', null)).resolves.toBe(
        100
      );
    });

    it('delegates getTransactions', async () => {
      const { repository, service } = makeRepo();
      const query = {
        userId: 'u-1',
        start: '2026-08-01',
        end: '2026-08-02',
        filterCategories: [] as string[],
        sort: 'date',
        pageSize: 20,
      };
      (repository.getTransactions as ReturnType<typeof vi.fn>).mockResolvedValue({
        expenses: [],
        categories: [],
        totalCount: 0,
      });
      await service.getTransactions(query);
      expect(repository.getTransactions).toHaveBeenCalledWith(query);
    });
  });

  describe('createExpense', () => {
    it('creates a valid expense', async () => {
      const { repository, service } = makeRepo();
      (repository.createExpense as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.createExpense('u-1', validExpense);
      expect(repository.createExpense).toHaveBeenCalledWith({ user_id: 'u-1', ...validExpense });
    });

    it('rejects NaN, zero and negative amounts', async () => {
      const { repository, service } = makeRepo();
      await expect(service.createExpense('u-1', { ...validExpense, amount: NaN })).rejects.toThrow(
        'مبلغ غير صالح'
      );
      await expect(service.createExpense('u-1', { ...validExpense, amount: 0 })).rejects.toThrow(
        'مبلغ غير صالح'
      );
      await expect(service.createExpense('u-1', { ...validExpense, amount: -5 })).rejects.toThrow(
        'مبلغ غير صالح'
      );
      expect(repository.createExpense).not.toHaveBeenCalled();
    });

    it('rejects a missing category_id', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.createExpense('u-1', { ...validExpense, category_id: '' })
      ).rejects.toThrow('التصنيف مطلوب');
      expect(repository.createExpense).not.toHaveBeenCalled();
    });

    it('rejects a missing date', async () => {
      const { repository, service } = makeRepo();
      await expect(service.createExpense('u-1', { ...validExpense, date: '' })).rejects.toThrow(
        'التاريخ مطلوب'
      );
      expect(repository.createExpense).not.toHaveBeenCalled();
    });

    it('accepts a null description', async () => {
      const { repository, service } = makeRepo();
      (repository.createExpense as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.createExpense('u-1', { ...validExpense, description: null });
      expect(repository.createExpense).toHaveBeenCalledWith({
        user_id: 'u-1',
        ...validExpense,
        description: null,
      });
    });

    it('propagates repository errors', async () => {
      const { repository, service } = makeRepo();
      (repository.createExpense as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('database error')
      );
      await expect(service.createExpense('u-1', validExpense)).rejects.toThrow('database error');
    });
  });

  describe('updateExpense', () => {
    it('delegates a valid update', async () => {
      const { repository, service } = makeRepo();
      (repository.updateExpense as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.updateExpense('e-1', 'u-1', validExpense);
      expect(repository.updateExpense).toHaveBeenCalledWith('e-1', 'u-1', validExpense);
    });

    it('rejects an invalid amount', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.updateExpense('e-1', 'u-1', { ...validExpense, amount: 0 })
      ).rejects.toThrow('مبلغ غير صالح');
      expect(repository.updateExpense).not.toHaveBeenCalled();
    });
  });

  describe('deleteExpense', () => {
    it('delegates deletion', async () => {
      const { repository, service } = makeRepo();
      (repository.deleteExpense as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.deleteExpense('e-1', 'u-1');
      expect(repository.deleteExpense).toHaveBeenCalledWith('e-1', 'u-1');
    });
  });

  describe('createCategory / updateCategory', () => {
    it('creates a valid category', async () => {
      const { repository, service } = makeRepo();
      (repository.createCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.createCategory('u-1', validCategory);
      expect(repository.createCategory).toHaveBeenCalledWith({ user_id: 'u-1', ...validCategory });
    });

    it('trims whitespace from the category name before delegating', async () => {
      const { repository, service } = makeRepo();
      (repository.createCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.createCategory('u-1', { name: '  طعام  ', colorHex: '#FF5733' });
      expect(repository.createCategory).toHaveBeenCalledWith({
        user_id: 'u-1',
        name: 'طعام',
        colorHex: '#FF5733',
      });
    });

    it('rejects an empty category name', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.createCategory('u-1', { name: '', colorHex: '#FF5733' })
      ).rejects.toThrow('الاسم مطلوب ويجب أن يكون أقل من 50 حرفًا');
      expect(repository.createCategory).not.toHaveBeenCalled();
    });

    it('rejects a category name longer than 50 chars (boundary)', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.createCategory('u-1', { name: 'أ'.repeat(51), colorHex: '#FF5733' })
      ).rejects.toThrow('الاسم مطلوب ويجب أن يكون أقل من 50 حرفًا');
      expect(repository.createCategory).not.toHaveBeenCalled();
    });

    it('accepts a category name of exactly 50 chars (boundary)', async () => {
      const { repository, service } = makeRepo();
      (repository.createCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await expect(
        service.createCategory('u-1', { name: 'أ'.repeat(50), colorHex: '#FF5733' })
      ).resolves.toBeUndefined();
    });

    it('rejects an invalid color hex', async () => {
      const { repository, service } = makeRepo();
      for (const bad of ['red', '#FF57', '#FF57331', '#gg5733', '', '#FFF', '#fffff']) {
        await expect(
          service.createCategory('u-1', { name: 'طعام', colorHex: bad })
        ).rejects.toThrow('اللون غير صالح');
      }
      expect(repository.createCategory).not.toHaveBeenCalled();
    });

    it('accepts lowercase hex colors (case-insensitive)', async () => {
      const { repository, service } = makeRepo();
      (repository.createCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await expect(
        service.createCategory('u-1', { name: 'طعام', colorHex: '#ff5733' })
      ).resolves.toBeUndefined();
    });

    it('validates on update too', async () => {
      const { repository, service } = makeRepo();
      await expect(
        service.updateCategory('cat-1', 'u-1', { name: '', colorHex: '#FF5733' })
      ).rejects.toThrow('الاسم مطلوب ويجب أن يكون أقل من 50 حرفًا');
      expect(repository.updateCategory).not.toHaveBeenCalled();
    });
  });

  describe('deleteCategory', () => {
    it('delegates deletion', async () => {
      const { repository, service } = makeRepo();
      (repository.deleteCategory as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      await service.deleteCategory('cat-1', 'u-1');
      expect(repository.deleteCategory).toHaveBeenCalledWith('cat-1', 'u-1');
    });
  });
});
