import { describe, it, expect } from 'vitest';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  formatMoney,
  getCurrencyInfo,
  getCurrencyName,
  getCurrencySymbol,
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
