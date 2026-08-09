import { describe, it, expect } from 'vitest';
import {
  calculateInsights,
  previousPeriodRange,
} from '@/backend/services/spendtrack/spend-insights';

describe('previousPeriodRange', () => {
  it('returns the full month before a 31-day month', () => {
    expect(previousPeriodRange('2026-08-01', '2026-08-31')).toEqual({
      start: '2026-07-01',
      end: '2026-07-31',
    });
  });

  it('handles a single-day range by using the day prior', () => {
    expect(previousPeriodRange('2026-08-15', '2026-08-15')).toEqual({
      start: '2026-08-14',
      end: '2026-08-14',
    });
  });

  it('spans a month boundary with an equal-length window', () => {
    expect(previousPeriodRange('2026-03-01', '2026-03-31')).toEqual({
      start: '2026-01-29',
      end: '2026-02-28',
    });
  });
});

describe('calculateInsights', () => {
  const breakdown = [
    { categoryId: 'c-1', name: 'طعام', colorHex: '#ff0000', total: 300 },
    { categoryId: 'c-2', name: 'مواصلات', colorHex: '#00ff00', total: 150 },
  ];

  it('computes average per day from the range length', () => {
    const result = calculateInsights({
      total: 450,
      breakdown,
      start: '2026-08-01',
      end: '2026-08-30',
      prevPeriodTotal: 400,
    });
    expect(result.avgPerDay).toBeCloseTo(15);
  });

  it('picks the top category and its share of total', () => {
    const result = calculateInsights({
      total: 450,
      breakdown,
      start: '2026-08-01',
      end: '2026-08-30',
      prevPeriodTotal: 400,
    });
    expect(result.topCategory).toEqual({ name: 'طعام', colorHex: '#ff0000', total: 300 });
    expect(result.topCategoryShare).toBeCloseTo(2 / 3);
  });

  it('computes the month-over-month percentage change', () => {
    const result = calculateInsights({
      total: 450,
      breakdown,
      start: '2026-08-01',
      end: '2026-08-30',
      prevPeriodTotal: 400,
    });
    expect(result.deltaPct).toBeCloseTo(0.125);
  });

  it('signals an increase with a positive delta', () => {
    const result = calculateInsights({
      total: 450,
      breakdown,
      start: '2026-08-01',
      end: '2026-08-30',
      prevPeriodTotal: 400,
    });
    expect(result.deltaPct!).toBeGreaterThan(0);
  });

  it('returns null when there is no previous-period data', () => {
    const result = calculateInsights({
      total: 450,
      breakdown,
      start: '2026-08-01',
      end: '2026-08-30',
      prevPeriodTotal: null,
    });
    expect(result.deltaPct).toBeNull();
  });

  it('returns null top category when there is no spending', () => {
    const result = calculateInsights({
      total: 0,
      breakdown: [],
      start: '2026-08-01',
      end: '2026-08-30',
      prevPeriodTotal: null,
    });
    expect(result.topCategory).toBeNull();
    expect(result.topCategoryShare).toBe(0);
  });
});
