import { describe, it, expect } from 'vitest';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  EXPENSE_CURRENCIES,
  SUPPORTED_CURRENCIES,
  formatMoney,
  getCurrencyDisplayName,
  getCurrencyDisplaySymbol,
  getCurrencyInfo,
  getCurrencyName,
  getCurrencySymbol,
  isExpenseCurrency,
  isSupportedCurrency,
} from '@/shared/currency';

describe('getCurrencyInfo', () => {
  it('returns USD by default', () => {
    expect(getCurrencyInfo(null).code).toBe('USD');
    expect(getCurrencyInfo(undefined).code).toBe('USD');
    expect(getCurrencyInfo('').code).toBe('USD');
  });

  it('falls back to USD for an unknown code', () => {
    expect(getCurrencyInfo('XYZ').code).toBe('USD');
  });

  it('returns the requested currency', () => {
    expect(getCurrencyInfo('SAR').code).toBe('SAR');
  });
});

describe('getCurrencySymbol && getCurrencyName', () => {
  it('returns symbol and name', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol(null)).toBe('$');
    expect(getCurrencyName('SAR')).toBe('الريال السعودي');
  });
});

describe('isSupportedCurrency', () => {
  it('accepts known codes and rejects others', () => {
    expect(isSupportedCurrency('USD')).toBe(true);
    expect(isSupportedCurrency('SYP')).toBe(true);
    expect(isSupportedCurrency('XYZ')).toBe(false);
    expect(isSupportedCurrency('')).toBe(false);
  });
});

describe('formatMoney', () => {
  it('prefixes $ for USD', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('suffixes the symbol for SAR', () => {
    expect(formatMoney(1234.5, 'SAR')).toBe('1,234.50 ر.س');
  });

  it('defaults to USD when no code is given', () => {
    expect(formatMoney(5, null)).toBe('$5.00');
  });

  it('formats with latn digits and thousands separators', () => {
    expect(formatMoney(1234567.89, 'USD')).toMatch(/1,234,567\.89/);
  });
});

describe('constants', () => {
  it('exposes USD as the default', () => {
    expect(DEFAULT_CURRENCY).toBe('USD');
  });

  it('includes SYP and USD in the supported list', () => {
    const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
    expect(codes).toContain('USD');
    expect(codes).toContain('SYP');
  });

  it('keeps the CURRENCIES map in sync with the supported list', () => {
    expect(SUPPORTED_CURRENCIES.length).toBe(Object.values(CURRENCIES).length);
  });
});

describe('currency display helpers', () => {
  it('resolves curated names and symbols verbatim', () => {
    expect(getCurrencyDisplayName('SAR')).toBe('الريال السعودي');
    expect(getCurrencyDisplaySymbol('USD')).toBe('$');
  });

  it('resolves non-curated ISO codes through Intl', () => {
    const name = getCurrencyDisplayName('CHF');
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toBe('CHF');
  });

  it('falls back to the code for unknown codes', () => {
    expect(getCurrencyDisplayName('XYZ')).toBe('XYZ');
    expect(getCurrencyDisplaySymbol('XYZ')).toBe('XYZ');
  });
});

describe('expense currency subset', () => {
  it('accepts curated expense currencies and rejects the rest', () => {
    expect(isExpenseCurrency('USD')).toBe(true);
    expect(isExpenseCurrency('SYP')).toBe(true);
    expect(isExpenseCurrency('CHF')).toBe(false);
  });

  it('mirrors the supported list', () => {
    expect(EXPENSE_CURRENCIES.length).toBe(SUPPORTED_CURRENCIES.length);
  });
});
