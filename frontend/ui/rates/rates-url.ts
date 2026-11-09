import type { RateBasis, RatesBoard } from '@/shared/contracts/rates';

/**
 * The rates converter's state as a URL (ADR-0147).
 *
 * `?from=&to=&basis=&market=` joins the address bar once the member changes a
 * control, so a refresh, Back and a shared link land on the same pair. The
 * amount and the grams are typed input, not a destination, and stay out; the
 * board's defaults (the visitor's country) are what an absent key means, so a
 * link that names only the pair still adapts to whoever opens it.
 */
export interface RatesSelection {
  from: string;
  to: string;
  basis: RateBasis;
  market: string | null;
}

const BASIS_VALUES: readonly RateBasis[] = ['parallel', 'official'];

/** The selection a query string names, or null when it names nothing. */
export function ratesSelectionFrom(
  search: string,
  defaults: { from: string; to: string },
  board: Pick<RatesBoard, 'currencies'>
): RatesSelection | null {
  const params = new URLSearchParams(search);
  const names = ['from', 'to', 'basis', 'market'] as const;

  if (!names.some((name) => params.has(name))) return null;

  const codes = new Set(board.currencies.map((currency) => currency.code));
  const from = params.get('from');
  const to = params.get('to');
  const basis = params.get('basis');
  const market = params.get('market');

  return {
    from: from !== null && codes.has(from) ? from : defaults.from,
    to: to !== null && codes.has(to) ? to : defaults.to,
    basis: BASIS_VALUES.includes(basis as RateBasis) ? (basis as RateBasis) : 'parallel',
    market: market ? market : null,
  };
}

/** The query string a selection writes. An unset market is left out. */
export function ratesSearch(selection: RatesSelection): string {
  const params = new URLSearchParams();

  params.set('from', selection.from);
  params.set('to', selection.to);
  params.set('basis', selection.basis);
  if (selection.market) params.set('market', selection.market);

  const search = params.toString();
  return search ? `?${search}` : '';
}
