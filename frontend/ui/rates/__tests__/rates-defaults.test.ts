import { describe, expect, it } from 'vitest';

import type { CurrencyQuote, RatesBoard } from '@/shared/contracts/rates';

import { resolveDefaultPair, resolveDefaultTarget } from '../rates-defaults';

function currency(code: string): CurrencyQuote {
  return {
    code,
    name: code,
    symbol: code,
    rate: 1,
    previousRate: null,
    changePct: null,
    asOf: null,
    parallel: null,
  };
}

function board(codes: string[], base = 'USD'): RatesBoard {
  return {
    base,
    fetchedAt: '2026-10-04T06:00:00.000Z',
    providerQuoteDate: '2026-10-04',
    isStale: false,
    currencies: codes.map(currency),
    metals: [],
  };
}

describe('resolveDefaultTarget', () => {
  const codes = ['USD', 'EUR', 'SAR', 'SYP'];

  it('uses the visitor country currency when the board quotes it', () => {
    expect(resolveDefaultTarget(board(codes), 'DE')).toBe('EUR');
    expect(resolveDefaultTarget(board(codes), 'SA')).toBe('SAR');
  });

  it('keeps the base for a visitor whose currency is the base', () => {
    expect(resolveDefaultTarget(board(codes), 'US')).toBe('USD');
  });

  it('falls back to SYP when the visitor currency is not quoted', () => {
    expect(resolveDefaultTarget(board(codes), 'GB')).toBe('SYP');
    expect(resolveDefaultTarget(board(codes), 'TR')).toBe('SYP');
  });

  it('falls back to SYP when the location is unknown', () => {
    expect(resolveDefaultTarget(board(codes), null)).toBe('SYP');
  });

  it('uses the first non-base currency when SYP is unavailable', () => {
    expect(resolveDefaultTarget(board(['USD', 'SAR']), 'GB')).toBe('SAR');
  });

  it('keeps the base when it is the only currency', () => {
    expect(resolveDefaultTarget(board(['USD']), null)).toBe('USD');
  });
});

describe('resolveDefaultPair', () => {
  const codes = ['USD', 'EUR', 'SAR', 'SYP'];

  it('keeps USD on the from side and the visitor currency on the to side', () => {
    expect(resolveDefaultPair(board(codes), 'DE')).toEqual({ from: 'USD', to: 'EUR' });
    expect(resolveDefaultPair(board(codes), 'TR')).toEqual({ from: 'USD', to: 'SYP' });
    expect(resolveDefaultPair(board(codes), null)).toEqual({ from: 'USD', to: 'SYP' });
  });

  it('moves the from side to SYP when the visitor already uses the base', () => {
    expect(resolveDefaultPair(board(codes), 'US')).toEqual({ from: 'SYP', to: 'USD' });
    expect(resolveDefaultPair(board(codes), 'EC')).toEqual({ from: 'SYP', to: 'USD' });
  });

  it('uses another quoted currency when SYP is unavailable for a base visitor', () => {
    expect(resolveDefaultPair(board(['USD', 'SAR']), 'US')).toEqual({ from: 'SAR', to: 'USD' });
  });

  it('keeps the base on both sides when it is the only currency', () => {
    expect(resolveDefaultPair(board(['USD']), 'US')).toEqual({ from: 'USD', to: 'USD' });
  });
});
