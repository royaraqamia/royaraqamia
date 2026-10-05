import { currencyFromCountry } from '@/frontend/ui/shared/country-currency';
import type { RatesBoard } from '@/shared/contracts/rates';

/**
 * Picks the currency the converter's "to" side starts on for a visitor: their
 * country's currency when the board quotes it, otherwise SYP, otherwise any
 * quoted currency other than the base.
 */
export function resolveDefaultTarget(board: RatesBoard, visitorIso: string | null): string {
  const codes = new Set(board.currencies.map((currency) => currency.code));
  const detected = currencyFromCountry(visitorIso);
  if (detected && codes.has(detected)) return detected;
  if (codes.has('SYP')) return 'SYP';
  return board.currencies.find((currency) => currency.code !== board.base)?.code ?? board.base;
}

/**
 * Picks the converter's starting pair. The "from" side is the base (USD) and the
 * "to" side follows the visitor. When both would be the base — i.e. the visitor
 * already uses the base currency — the "from" side moves to SYP (or any quoted
 * currency other than the base) so the pair still converts across currencies.
 */
export function resolveDefaultPair(
  board: RatesBoard,
  visitorIso: string | null
): { from: string; to: string } {
  const codes = new Set(board.currencies.map((currency) => currency.code));
  const to = resolveDefaultTarget(board, visitorIso);
  if (to !== board.base) return { from: board.base, to };

  const from = codes.has('SYP')
    ? 'SYP'
    : (board.currencies.find((currency) => currency.code !== board.base)?.code ?? board.base);
  return { from, to: board.base };
}
