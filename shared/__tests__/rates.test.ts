import { describe, it, expect } from 'vitest';
import { TROY_OUNCE_GRAMS } from '@/shared/contracts/rates';
import {
  computeChangePct,
  convertAmount,
  isParallelRate,
  karatPricePerGram,
  pricePerGram,
  usdPerUnit,
  type RateLookup,
} from '@/shared/rates';

const lookup: RateLookup = {
  base: 'USD',
  rates: { USD: 1, SAR: 3.75, SYP: 13000 },
  parallel: { SYP: 13800 },
  metals: { XAU: 2000, XAG: 25 },
};

describe('usdPerUnit', () => {
  it('treats the base currency as 1', () => {
    expect(usdPerUnit(lookup, 'USD')).toBe(1);
  });

  it('inverts a fiat rate', () => {
    expect(usdPerUnit(lookup, 'SAR')).toBeCloseTo(1 / 3.75);
  });

  it('converts a metal ounce price to a per-gram price', () => {
    expect(usdPerUnit(lookup, 'XAU')).toBeCloseTo(2000 / TROY_OUNCE_GRAMS);
  });

  it('returns null for an unknown code', () => {
    expect(usdPerUnit(lookup, 'XYZ')).toBeNull();
  });

  it('returns null for a non-positive rate', () => {
    expect(
      usdPerUnit({ base: 'USD', rates: { BAD: 0 }, parallel: {}, metals: {} }, 'BAD')
    ).toBeNull();
  });

  it('uses the parallel value on the parallel basis', () => {
    expect(usdPerUnit(lookup, 'SYP', 'parallel')).toBeCloseTo(1 / 13800);
  });

  it('falls back to the official rate when a code has no parallel value', () => {
    expect(usdPerUnit(lookup, 'SAR', 'parallel')).toBeCloseTo(1 / 3.75);
  });

  it('ignores the basis for metals', () => {
    expect(usdPerUnit(lookup, 'XAU', 'parallel')).toBeCloseTo(2000 / TROY_OUNCE_GRAMS);
  });
});

describe('isParallelRate', () => {
  it('is true only for codes with a positive parallel value', () => {
    expect(isParallelRate(lookup, 'SYP')).toBe(true);
    expect(isParallelRate(lookup, 'SAR')).toBe(false);
    expect(isParallelRate(lookup, 'USD')).toBe(false);
  });
});

describe('convertAmount', () => {
  it('converts a fiat pair', () => {
    const result = convertAmount(lookup, 'SAR', 'USD', 3.75);
    expect(result?.result).toBeCloseTo(1);
    expect(result?.rate).toBeCloseTo(1 / 3.75);
  });

  it('converts USD to fiat', () => {
    expect(convertAmount(lookup, 'USD', 'SAR', 1)?.result).toBeCloseTo(3.75);
  });

  it('cross-converts two non-base currencies', () => {
    const result = convertAmount(lookup, 'SAR', 'SYP', 1);
    expect(result?.result).toBeCloseTo(13000 / 3.75);
  });

  it('converts on the parallel basis', () => {
    const result = convertAmount(lookup, 'SAR', 'SYP', 1, 'parallel');
    expect(result?.result).toBeCloseTo(13800 / 3.75);
  });

  it('converts a gram of gold to USD', () => {
    const result = convertAmount(lookup, 'XAU', 'USD', 1);
    expect(result?.result).toBeCloseTo(2000 / TROY_OUNCE_GRAMS);
  });

  it('converts USD to grams of gold', () => {
    const result = convertAmount(lookup, 'USD', 'XAU', 2000);
    expect(result?.result).toBeCloseTo(TROY_OUNCE_GRAMS);
  });

  it('returns null when either side is unknown', () => {
    expect(convertAmount(lookup, 'XYZ', 'USD', 1)).toBeNull();
    expect(convertAmount(lookup, 'USD', 'XYZ', 1)).toBeNull();
  });
});

describe('metal helpers', () => {
  it('derives grams from ounces', () => {
    expect(pricePerGram(TROY_OUNCE_GRAMS)).toBeCloseTo(1);
  });

  it('scales by karat', () => {
    expect(karatPricePerGram(TROY_OUNCE_GRAMS, 24)).toBeCloseTo(1);
    expect(karatPricePerGram(TROY_OUNCE_GRAMS, 18)).toBeCloseTo(0.75);
  });
});

describe('computeChangePct', () => {
  it('computes a positive change', () => {
    expect(computeChangePct(110, 100)).toBeCloseTo(10);
  });

  it('computes a negative change', () => {
    expect(computeChangePct(90, 100)).toBeCloseTo(-10);
  });

  it('returns null without a previous value', () => {
    expect(computeChangePct(100, null)).toBeNull();
    expect(computeChangePct(100, 0)).toBeNull();
  });
});
