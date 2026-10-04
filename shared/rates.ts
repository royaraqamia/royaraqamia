import { METAL_CODES, TROY_OUNCE_GRAMS, type MetalCode } from '@/shared/contracts/rates';

export interface RateLookup {
  base: string;
  rates: Record<string, number>;
  metals: Record<string, number>;
}

export function isMetalCode(code: string): code is MetalCode {
  return (METAL_CODES as readonly string[]).includes(code);
}

export function pricePerGram(pricePerOunce: number): number {
  return pricePerOunce / TROY_OUNCE_GRAMS;
}

export function karatPricePerGram(pricePerOunce: number, karat: number): number {
  return (pricePerOunce / TROY_OUNCE_GRAMS) * (karat / 24);
}

export function usdPerUnit(lookup: RateLookup, code: string): number | null {
  if (isMetalCode(code)) {
    const perOunce = lookup.metals[code];
    if (perOunce === undefined || perOunce <= 0) return null;
    return pricePerGram(perOunce);
  }

  if (code === lookup.base) return 1;

  const rate = lookup.rates[code];
  if (rate === undefined || rate <= 0) return null;
  return 1 / rate;
}

export function convertAmount(
  lookup: RateLookup,
  from: string,
  to: string,
  amount: number
): { result: number; rate: number } | null {
  const fromUsd = usdPerUnit(lookup, from);
  const toUsd = usdPerUnit(lookup, to);
  if (fromUsd === null || toUsd === null || toUsd === 0) return null;

  const rate = fromUsd / toUsd;
  return { result: amount * rate, rate };
}

export function computeChangePct(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
