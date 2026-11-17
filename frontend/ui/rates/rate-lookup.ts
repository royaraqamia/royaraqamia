import type { ParallelMarket, RatesBoard } from '@/shared/contracts/rates';

/**
 * The conversion lookup is shared with the server (`shared/rates.ts`): the
 * assistant's rate tool reads the same board this page does, and a pair rate
 * that disagreed with the converter here would be a wrong number in a member's
 * thread rather than a red test.
 */
export { buildLookup } from '@/shared/rates';

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
