import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockService = {
  getTransactions: vi.fn(),
  createExpense: vi.fn(),
  createCategory: vi.fn(),
  getBudget: vi.fn(),
  setBudget: vi.fn(),
};

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/identity/server', () => ({
  identity: {
    resolveSession: async () => {
      const { user, supabase } = await mockGetAuthUser();
      return { user, client: supabase };
    },
    resolveOptional: async () => ({ user: null, client: null }),
    resolveAdmin: async () => ({ kind: 'anonymous' }),
  },
  bearerReader: { read: vi.fn() },
}));

vi.mock('@/backend/config/spendtrack', () => ({
  createSpendtrackService: () => mockService,
}));

import {
  createCategory,
  createExpense,
  getExpenses,
  setBudget,
} from '@/backend/controllers/spendtrack';

describe('spendtrack controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.com' },
      supabase: {},
    });
    mockService.getTransactions.mockResolvedValue({ expenses: [{ id: 'e-1' }] });
    mockService.createExpense.mockResolvedValue(undefined);
    mockService.createCategory.mockResolvedValue(undefined);
    mockService.setBudget.mockResolvedValue(undefined);
  });

  it('returns 401 with the product body when there is no session user', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });

    const result = await getExpenses(new URLSearchParams());

    expect(result).toEqual(expect.objectContaining({ status: 401, body: { error: 'غير مصرح' } }));
    expect(mockService.getTransactions).not.toHaveBeenCalled();
  });

  it('scopes the query to the session user id', async () => {
    const result = await getExpenses(new URLSearchParams({ limit: '5' }));

    expect(result).toMatchObject({ status: 200 });
    expect(mockService.getTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', pageSize: 5 })
    );
  });

  it('maps a domain rejection on createExpense to 400 with the message', async () => {
    mockService.createExpense.mockRejectedValue(
      new Error('مجموع التقسيمات يجب أن يساوي المبلغ الإجمالي')
    );

    const result = await createExpense({ amount: 10, category_id: 'c-1', date: '2026-01-01' });

    expect(result).toEqual(
      expect.objectContaining({
        status: 400,
        body: { error: 'مجموع التقسيمات يجب أن يساوي المبلغ الإجمالي' },
      })
    );
  });

  it('keeps the revalidation hint on a successful expense creation', async () => {
    const result = await createExpense({ amount: 10, category_id: 'c-1', date: '2026-01-01' });

    expect(result).toEqual(
      expect.objectContaining({
        status: 200,
        body: { success: true },
        revalidate: [{ path: '/spendtrack', type: 'layout' }],
      })
    );
  });

  it('maps a category failure to 500, preserving the distinct status', async () => {
    mockService.createCategory.mockRejectedValue(new Error('فشل'));

    const result = await createCategory({ name: 'Food', color_hex: '#aabbcc' });

    expect(result).toEqual(expect.objectContaining({ status: 500, body: { error: 'فشل' } }));
  });

  it('maps a budget rejection to 400', async () => {
    mockService.setBudget.mockRejectedValue(new Error('مبلغ غير صالح'));

    const result = await setBudget({ month: '2026-01', amount: -1 });

    expect(result).toEqual(
      expect.objectContaining({ status: 400, body: { error: 'مبلغ غير صالح' } })
    );
  });
});
