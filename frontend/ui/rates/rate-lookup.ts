import type { ParallelMarket, RatesBoard } from '@/shared/contracts/rates';
import type { RateLookup } from '@/shared/rates';

/**
 * Builds the conversion lookup from a board, resolving each dual-rate currency
 * to the requested market when it spans more than one (YER), otherwise its
 * default parallel value.
 */
export function buildLookup(board: RatesBoard, activeMarket: string | null = null): RateLookup {
  const parallel: Record<string, number> = {};
  for (const currency of board.currencies) {
    if (!currency.parallel) continue;
    const markets = currency.parallelMarkets;
    const chosen =
      markets && markets.length > 0
        ? (markets.find((option) => option.key === activeMarket) ?? markets[0])
        : null;
    parallel[currency.code] = chosen ? chosen.rate.rate : currency.parallel.rate;
  }

  return {
    base: board.base,
    rates: Object.fromEntries(board.currencies.map((currency) => [currency.code, currency.rate])),
    parallel,
    metals: Object.fromEntries(board.metals.map((metal) => [metal.code, metal.pricePerOunceUsd])),
  };
}

/** The parallel markets quoted for the first of `codes` that has more than one. */
export function marketOptionsFor(
  board: RatesBoard,
  codes: readonly string[]
): readonly ParallelMarket[] {
  return (
    board.currencies.find(
      (currency) => codes.includes(currency.code) && currency.parallelMarkets?.length
    )?.parallelMarkets ?? []
  );
}

/**
 * The oldest parallel quote date among `codes` that carry one (`YYYY-MM-DD`), or
 * null. A date older than the board's provider quote date means the market value
 * was carried forward from an earlier sync (ADR-0014).
 */
export function oldestParallelAsOf(board: RatesBoard, codes: readonly string[]): string | null {
  let oldest: string | null = null;
  for (const code of codes) {
    const asOf =
      board.currencies.find((currency) => currency.code === code)?.parallel?.asOf ?? null;
    if (asOf === null) continue;
    if (oldest === null || asOf < oldest) oldest = asOf;
  }
  return oldest;
}
