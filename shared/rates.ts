import {
  METAL_CODES,
  TROY_OUNCE_GRAMS,
  type MetalCode,
  type RateBasis,
} from '@/shared/contracts/rates';

export interface RateLookup {
  base: string;
  /** Official/reference units per base, per code. */
  rates: Record<string, number>;
  /** Parallel-market units per base, per code. Absent for single-rate codes. */
  parallel: Record<string, number>;
  metals: Record<string, number>;
}

export function isMetalCode(code: string): code is MetalCode {
  return (METAL_CODES as readonly string[]).includes(code);
}

/** Whether the lookup carries a parallel value for a fiat code. */
export function isParallelRate(lookup: RateLookup, code: string): boolean {
  const value = lookup.parallel[code];
  return value !== undefined && value > 0;
}

/** Resolves a fiat code's units-per-base on the requested basis, falling back
 * to the official rate when no parallel value exists for that code. */
function fiatRate(lookup: RateLookup, code: string, basis: RateBasis): number | undefined {
  if (basis === 'parallel') {
    const parallel = lookup.parallel[code];
    if (parallel !== undefined && parallel > 0) return parallel;
  }
  return lookup.rates[code];
}

export function pricePerGram(pricePerOunce: number): number {
  return pricePerOunce / TROY_OUNCE_GRAMS;
}

export function karatPricePerGram(pricePerOunce: number, karat: number): number {
  return (pricePerOunce / TROY_OUNCE_GRAMS) * (karat / 24);
}

export function usdPerUnit(
  lookup: RateLookup,
  code: string,
  basis: RateBasis = 'official'
): number | null {
  if (isMetalCode(code)) {
    const perOunce = lookup.metals[code];
    if (perOunce === undefined || perOunce <= 0) return null;
    return pricePerGram(perOunce);
  }

  if (code === lookup.base) return 1;

  const rate = fiatRate(lookup, code, basis);
  if (rate === undefined || rate <= 0) return null;
  return 1 / rate;
}

export function convertAmount(
  lookup: RateLookup,
  from: string,
  to: string,
  amount: number,
  basis: RateBasis = 'official'
): { result: number; rate: number } | null {
  const fromUsd = usdPerUnit(lookup, from, basis);
  const toUsd = usdPerUnit(lookup, to, basis);
  if (fromUsd === null || toUsd === null || toUsd === 0) return null;

  const rate = fromUsd / toUsd;
  return { result: amount * rate, rate };
}

export function computeChangePct(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
