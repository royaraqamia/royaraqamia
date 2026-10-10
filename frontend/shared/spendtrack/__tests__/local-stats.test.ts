import { describe, it, expect } from 'vitest';
import type { Category, Expense } from '@/shared/contracts/spendtrack';
import {
  categoryBreakdown,
  computeInsights,
  dailyTotals,
  totalExpenses,
} from '@/frontend/shared/spendtrack/local-stats';

function category(id: string, name: string, colorHex = '#111111'): Category {
  return { id, user_id: null, name, colorHex, created_at: '2026-01-01T00:00:00.000Z' };
}

function expense(
  overrides: Partial<Expense> & Pick<Expense, 'id' | 'category_id' | 'amount' | 'date'>
): Expense {
  return {
    user_id: 'u1',
    description: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const food = category('c-food', 'طعام', '#ff0000');
const transport = category('c-transport', 'مواصلات', '#00ff00');
const categories = [food, transport];

describe('totalExpenses', () => {
  const expenses = [
    expense({ id: 'e1', category_id: 'c-food', amount: 10, date: '2026-02-01' }),
    expense({ id: 'e2', category_id: 'c-transport', amount: 5, date: '2026-02-02' }),
    expense({ id: 'e3', category_id: 'c-food', amount: 100, date: '2026-03-01' }),
  ];

  it('sums only rows inside the range', () => {
    expect(totalExpenses(expenses, '2026-02-01', '2026-02-28', [])).toBe(15);
  });

  it('applies the category filter', () => {
    expect(totalExpenses(expenses, '2026-01-01', '2026-12-31', ['c-food'])).toBe(110);
  });
});

describe('dailyTotals', () => {
  it('groups by date in ascending order', () => {
    const expenses = [
      expense({ id: 'e1', category_id: 'c-food', amount: 10, date: '2026-02-02' }),
      expense({ id: 'e2', category_id: 'c-food', amount: 15, date: '2026-02-01' }),
      expense({ id: 'e3', category_id: 'c-food', amount: 5, date: '2026-02-02' }),
    ];
    expect(dailyTotals(expenses, '2026-02-01', '2026-02-28', [])).toEqual([
      { date: '2026-02-01', total: 15 },
      { date: '2026-02-02', total: 15 },
    ]);
  });
});

describe('categoryBreakdown', () => {
  it('attributes split amounts to their split categories', () => {
    const expenses = [
      expense({
        id: 'e1',
        category_id: 'c-food',
        amount: 30,
        date: '2026-02-01',
        splits: [
          {
            id: 's1',
            expense_id: 'e1',
            category_id: 'c-transport',
            amount: 20,
          },
        ],
      }),
    ];
    expect(categoryBreakdown(expenses, categories, '2026-02-01', '2026-02-28', [])).toEqual([
      { categoryId: 'c-transport', colorHex: '#00ff00', name: 'مواصلات', total: 20 },
    ]);
  });

  it('sorts by total descending and drops zero rows', () => {
    const expenses = [
      expense({ id: 'e1', category_id: 'c-food', amount: 10, date: '2026-02-01' }),
      expense({ id: 'e2', category_id: 'c-transport', amount: 40, date: '2026-02-02' }),
    ];
    const result = categoryBreakdown(expenses, categories, '2026-02-01', '2026-02-28', []);
    expect(result.map((row) => row.categoryId)).toEqual(['c-transport', 'c-food']);
  });
});

describe('computeInsights', () => {
  it('computes average per day, top-category share and period delta', () => {
    const expenses = [
      expense({ id: 'e1', category_id: 'c-food', amount: 100, date: '2026-02-01' }),
      expense({ id: 'e2', category_id: 'c-transport', amount: 50, date: '2026-02-01' }),
      expense({ id: 'e3', category_id: 'c-food', amount: 75, date: '2026-01-31' }),
    ];
    const insights = computeInsights(expenses, categories, '2026-02-01', '2026-02-02', []);
    expect(insights.avgPerDay).toBe(75);
    expect(insights.topCategory).toEqual({ name: 'طعام', colorHex: '#ff0000', total: 100 });
    expect(insights.topCategoryShare).toBeCloseTo(100 / 150, 5);
    expect(insights.prevPeriodTotal).toBe(75);
    expect(insights.deltaPct).toBeCloseTo(1, 5);
  });

  it('returns a null delta when there is no previous period spend', () => {
    const expenses = [expense({ id: 'e1', category_id: 'c-food', amount: 10, date: '2026-02-01' })];
    const insights = computeInsights(expenses, categories, '2026-02-01', '2026-02-02', []);
    expect(insights.prevPeriodTotal).toBe(0);
    expect(insights.deltaPct).toBeNull();
  });
});
