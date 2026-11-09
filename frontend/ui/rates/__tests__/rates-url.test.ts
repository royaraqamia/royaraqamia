import { describe, expect, it } from 'vitest';

import type { RatesBoard } from '@/shared/contracts/rates';
import { ratesSearch, ratesSelectionFrom } from '../rates-url';

const board = {
  currencies: [{ code: 'USD' }, { code: 'EUR' }, { code: 'SYP' }],
} as unknown as Pick<RatesBoard, 'currencies'>;

const defaults = { from: 'USD', to: 'SYP' };

describe('ratesSelectionFrom', () => {
  it('names nothing when the URL carries no converter state', () => {
    expect(ratesSelectionFrom('', defaults, board)).toBeNull();
    expect(ratesSelectionFrom('?utm_source=x', defaults, board)).toBeNull();
  });

  it('reads the four controls the ADR puts in the URL', () => {
    expect(
      ratesSelectionFrom('?from=EUR&to=USD&basis=official&market=damascus', defaults, board)
    ).toEqual({ from: 'EUR', to: 'USD', basis: 'official', market: 'damascus' });
  });

  it('falls back to the defaults for a code the board does not quote', () => {
    expect(ratesSelectionFrom('?from=XXX&to=YYY&basis=weekly', defaults, board)).toEqual({
      from: 'USD',
      to: 'SYP',
      basis: 'parallel',
      market: null,
    });
  });

  it('lets a link name only the pair', () => {
    expect(ratesSelectionFrom('?to=EUR', defaults, board)).toEqual({
      from: 'USD',
      to: 'EUR',
      basis: 'parallel',
      market: null,
    });
  });
});

describe('ratesSearch', () => {
  it('writes the four controls and leaves an unset market out', () => {
    expect(ratesSearch({ from: 'USD', to: 'EUR', basis: 'official', market: null })).toBe(
      '?from=USD&to=EUR&basis=official'
    );
  });

  it('round-trips through the reader', () => {
    const selection = { from: 'USD', to: 'EUR', basis: 'parallel' as const, market: 'aleppo' };

    expect(ratesSelectionFrom(ratesSearch(selection), defaults, board)).toEqual(selection);
  });
});
